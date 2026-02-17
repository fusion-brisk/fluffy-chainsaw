/**
 * Structure Builder — построение структуры страницы из массива rows
 * 
 * Анализирует типы сниппетов и группирует последовательные элементы
 * одного типа в контейнеры
 */

import { CSVRow } from '../types';
import { Logger } from '../logger';
import { 
  SnippetType, 
  ContainerType, 
  StructureNode, 
  SerpPageStructure,
  PageMeta 
} from './types';
import { 
  getContainerTypeForSnippet,
  isSnippetType 
} from './component-map';

/**
 * Генератор уникальных ID
 */
let nodeIdCounter = 0;

function generateNodeId(): string {
  return `node-${++nodeIdCounter}`;
}

/**
 * Сбросить счётчик ID (для тестов)
 */
export function resetNodeIdCounter(): void {
  nodeIdCounter = 0;
}

/**
 * Определить тип сниппета по данным row
 */
export function detectSnippetType(row: CSVRow): SnippetType {
  const type = row['#SnippetType'] || '';
  
  // Прямое совпадение
  if (type === 'EOfferItem') return 'EOfferItem';
  if (type === 'EProductSnippet2') return 'EProductSnippet2';
  if (type === 'EShopItem') return 'EShopItem';
  if (type === 'Organic') return 'Organic';
  if (type === 'Organic_withOfferInfo') return 'Organic_withOfferInfo';
  if (type === 'ESnippet') return 'ESnippet';
  if (type === 'ProductTile-Item') return 'EProductSnippet2'; // ProductTile → EProductSnippet2
  
  // Fallback по подстроке
  if (type.includes('Offer')) return 'EOfferItem';
  if (type.includes('Shop')) return 'EShopItem';
  if (type.includes('Product') || type.includes('Tile')) return 'EProductSnippet2';
  if (type.includes('Organic')) return 'Organic';
  
  // По умолчанию — ESnippet
  return 'ESnippet';
}

/**
 * Группа элементов из одного serp-item (HTML <li>)
 */
interface SerpItemGroup {
  serpItemId: string;
  rows: CSVRow[];
  startIndex: number;
}

/**
 * Сгруппировать rows по #serpItemId (соответствует HTML <li data-cid="...">)
 * Элементы с одинаковым serpItemId объединяются в одну группу
 */
function groupBySerpItemId(rows: CSVRow[]): SerpItemGroup[] {
  const groups: SerpItemGroup[] = [];
  const groupMap = new Map<string, SerpItemGroup>();
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const serpItemId = row['#serpItemId'] || '';
    
    // Если serpItemId пустой — каждый элемент в своей группе
    if (!serpItemId) {
      groups.push({
        serpItemId: `__single_${i}`,
        rows: [row],
        startIndex: i,
      });
      continue;
    }
    
    // Ищем существующую группу с таким ID
    if (groupMap.has(serpItemId)) {
      groupMap.get(serpItemId)!.rows.push(row);
    } else {
      const group: SerpItemGroup = {
        serpItemId,
        rows: [row],
        startIndex: i,
      };
      groupMap.set(serpItemId, group);
      groups.push(group);
    }
  }
  
  Logger.debug(`[StructureBuilder] Группировка по serpItemId: ${groups.length} групп из ${rows.length} rows`);
  
  return groups;
}

/**
 * Построить узел сниппета
 */
function buildSnippetNode(row: CSVRow, order: number): StructureNode {
  const snippetType = detectSnippetType(row);
  
  return {
    id: generateNodeId(),
    type: snippetType,
    data: row,
    order,
  };
}

/**
 * Построить узел контейнера с дочерними сниппетами
 */
function buildContainerNode(
  containerType: ContainerType,
  rows: CSVRow[],
  order: number
): StructureNode {
  const children: StructureNode[] = rows.map((row, idx) => 
    buildSnippetNode(row, idx)
  );
  
  return {
    id: generateNodeId(),
    type: containerType,
    children,
    order,
  };
}

/**
 * Построить структуру страницы из массива rows
 */
export function buildPageStructure(
  rows: CSVRow[],
  options: {
    query?: string;
    platform?: 'desktop' | 'touch';
  } = {}
): SerpPageStructure {
  const startTime = Date.now();
  resetNodeIdCounter();
  
  Logger.info(`[StructureBuilder] Построение структуры из ${rows.length} rows`);
  
  // Отделяем специальные элементы (EQuickFilters и т.д.) от сниппетов
  const specialElements: CSVRow[] = [];
  const snippetRows: CSVRow[] = [];
  
  for (const row of rows) {
    const type = row['#SnippetType'] || '';
    if (type === 'EQuickFilters') {
      specialElements.push(row);
    } else {
      snippetRows.push(row);
    }
  }
  
  Logger.debug(`[StructureBuilder] Специальные элементы: ${specialElements.length}, сниппеты: ${snippetRows.length}`);
  
  // Группируем элементы по serpItemId (соответствует HTML <li>)
  const serpItemGroups = groupBySerpItemId(snippetRows);
  
  Logger.debug(`[StructureBuilder] Найдено ${serpItemGroups.length} serp-item групп`);
  
  // Строим узлы для content__left
  const contentLeft: StructureNode[] = [];
  let order = 0;
  
  // Сначала добавляем специальные элементы (EQuickFilters)
  for (const row of specialElements) {
    const type = row['#SnippetType'] as string;
    contentLeft.push({
      id: generateNodeId(),
      type: type as any, // EQuickFilters is LayoutElementType
      data: row,
      order: order++,
    });
    Logger.debug(`[StructureBuilder] Добавлен специальный элемент: ${type}`);
  }
  
  for (const serpGroup of serpItemGroups) {
    if (serpGroup.rows.length > 1) {
      // Несколько элементов в одном <li> — создаём группу-контейнер
      const firstRow = serpGroup.rows[0];
      const firstSnippetType = detectSnippetType(firstRow);
      const isAdv = firstRow['#isAdv'] === 'true';
      
      // Используем #containerType из данных если есть
      const containerTypeFromData = firstRow['#containerType'] as string;
      
      let containerType: ContainerType;
      
      if (containerTypeFromData === 'ImagesGrid') {
        containerType = 'ImagesGrid';
      } else if (containerTypeFromData === 'EntityOffers') {
        containerType = 'EntityOffers';
      } else if (containerTypeFromData === 'EShopList') {
        containerType = 'EShopList';
      } else if (containerTypeFromData === 'ProductsTiles') {
        containerType = 'ProductsTiles';
      } else if (containerTypeFromData === 'AdvProductGallery' || isAdv) {
        containerType = 'AdvProductGallery';
      } else if (firstSnippetType === 'EProductSnippet2') {
        containerType = 'ProductsTiles';
      } else if (firstSnippetType === 'EShopItem') {
        containerType = 'EShopList';
      } else if (firstSnippetType === 'ESnippet') {
        containerType = 'EntityOffers';
      } else {
        containerType = getContainerTypeForSnippet(firstSnippetType) || 'ProductsTiles';
      }
      
      const containerNode = buildContainerNode(
        containerType,
        serpGroup.rows,
        order++
      );
      contentLeft.push(containerNode);
      
      Logger.debug(
        `[StructureBuilder] Группа serpItemId=${serpGroup.serpItemId}: ${serpGroup.rows.length} элементов → контейнер ${containerType}`
      );
    } else {
      // Один элемент в <li> — без контейнера
      for (const row of serpGroup.rows) {
        // ImagesGrid: одиночный row, но это контейнер (не сниппет)
        if (row['#containerType'] === 'ImagesGrid') {
          const imagesNode: StructureNode = {
            id: generateNodeId(),
            type: 'ImagesGrid' as ContainerType,
            data: row,
            children: [],
            order: order++
          };
          contentLeft.push(imagesNode);
          Logger.debug('[StructureBuilder] ImagesGrid node создан');
        } else {
          const snippetNode = buildSnippetNode(row, order++);
          contentLeft.push(snippetNode);
        }
      }
    }
  }
  
  // Собираем статистику
  const byType: Record<string, number> = {};
  let totalSnippets = 0;
  let containers = 0;
  
  function countNodes(nodes: StructureNode[]): void {
    for (const node of nodes) {
      if (node.children) {
        // Это контейнер
        containers++;
        byType[node.type] = (byType[node.type] || 0) + 1;
        countNodes(node.children);
      } else {
        // Это сниппет
        totalSnippets++;
        byType[node.type] = (byType[node.type] || 0) + 1;
      }
    }
  }
  countNodes(contentLeft);
  
  // Метаданные
  const meta: PageMeta = {
    query: options.query || rows[0]?.['#query'] || rows[0]?.query,
    platform: options.platform || 'desktop',
    totalResults: rows.length,
    source: 'rows',
  };
  
  const parseTime = Date.now() - startTime;
  
  Logger.info(
    `[StructureBuilder] Структура построена: ${contentLeft.length} узлов, ` +
    `${containers} контейнеров, ${totalSnippets} сниппетов за ${parseTime}ms`
  );
  
  return {
    meta,
    contentLeft,
    contentRight: [], // Пока пусто
    stats: {
      totalSnippets,
      byType,
      containers,
    },
  };
}

/**
 * Сортировать узлы по порядку появления в HTML (order).
 * EQuickFilters всегда первым (после Header).
 */
export function sortContentNodes(nodes: StructureNode[]): StructureNode[] {
  return [...nodes].sort((a, b) => {
    // EQuickFilters всегда первым
    if (a.type === 'EQuickFilters' && b.type !== 'EQuickFilters') return -1;
    if (b.type === 'EQuickFilters' && a.type !== 'EQuickFilters') return 1;
    
    // Остальные — по порядку появления (order)
    return a.order - b.order;
  });
}

