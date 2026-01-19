/**
 * Structure Parser — парсинг структуры HTML страницы
 * 
 * Извлекает порядок и вложенность элементов из HTML,
 * используя существующий snippet-parser для данных
 */

import { CSVRow } from '../types';
import { Logger } from '../logger';
import { parseYandexSearchResults } from '../utils/snippet-parser';
import { 
  PageElement, 
  PageStructure, 
  PageMeta, 
  ParsingStats,
  SnippetType,
  GroupType,
  StructureNode,
  SerpPageStructure,
  ContainerType
} from './types';
import { 
  CSS_CLASS_TO_SNIPPET_TYPE, 
  CSS_CLASS_TO_GROUP_TYPE,
  isGroupType,
  isContainerType,
  getContainerConfig
} from './component-map';

/**
 * Определить платформу по HTML контенту
 * @returns 'touch' | 'desktop'
 */
export function detectPlatformFromHtml(htmlContent: string): 'touch' | 'desktop' {
  // Надёжные эвристики — проверяем touch ПЕРВЫМ (HeaderPhone более специфичен)
  // НЕ используем i-ua_platform_* — они встречаются в скриптах обоих версий
  
  const hasHeaderPhone = htmlContent.includes('class="HeaderPhone"');
  const hasHeaderDesktop = htmlContent.includes('class="HeaderDesktop');
  
  console.log(`[detectPlatform] HeaderPhone: ${hasHeaderPhone}, HeaderDesktop: ${hasHeaderDesktop}`);
  
  // Touch проверяем первым — если есть HeaderPhone, это точно touch
  if (hasHeaderPhone) {
    console.log('[detectPlatform] → touch (HeaderPhone найден)');
    return 'touch';
  }
  
  // Desktop — если есть HeaderDesktop
  if (hasHeaderDesktop) {
    console.log('[detectPlatform] → desktop (HeaderDesktop найден)');
    return 'desktop';
  }
  
  // По умолчанию — desktop
  console.log('[detectPlatform] → desktop (по умолчанию)');
  return 'desktop';
}

/**
 * Селекторы для поиска элементов страницы
 * Порядок важен — более специфичные селекторы первыми
 */
const ELEMENT_SELECTORS = [
  // Группы (контейнеры)
  { selector: '.serp-list', type: 'OrganicBlock' as GroupType },
  { selector: '[class*="EShopGroup"]', type: 'EShopGroup' as GroupType },
  { selector: '[class*="EOfferGroup"]', type: 'EOfferGroup' as GroupType },
  { selector: '.ProductTileRow', type: 'ProductTileRow' as GroupType },
  
  // Сниппеты (в порядке приоритета)
  { selector: '.EOfferItem', type: 'EOfferItem' as SnippetType },
  { selector: '[class*="EProductSnippet2"]', type: 'EProductSnippet2' as SnippetType },
  { selector: '.EShopItem', type: 'EShopItem' as SnippetType },
  { selector: '.ProductTile-Item', type: 'ProductTile-Item' as SnippetType },
  { selector: '[class*="Organic_withOfferInfo"]', type: 'Organic_withOfferInfo' as SnippetType },
  { selector: '[class*="Organic"]', type: 'Organic' as SnippetType },
  { selector: '.ESnippet', type: 'ESnippet' as SnippetType },
];

/**
 * Определить тип элемента по CSS классам
 */
function detectElementType(element: Element): SnippetType | GroupType | null {
  const className = element.className || '';
  
  // Проверяем группы
  for (const [cssClass, groupType] of Object.entries(CSS_CLASS_TO_GROUP_TYPE)) {
    if (className.includes(cssClass)) {
      return groupType;
    }
  }
  
  // Проверяем сниппеты (более специфичные первыми)
  if (className.includes('EOfferItem')) return 'EOfferItem';
  if (className.includes('EProductSnippet2')) return 'EProductSnippet2';
  if (className.includes('EShopItem')) return 'EShopItem';
  if (className.includes('ProductTile-Item')) return 'ProductTile-Item';
  if (className.includes('Organic_withOfferInfo')) return 'Organic_withOfferInfo';
  if (className.includes('Organic')) return 'Organic';
  if (className.includes('ESnippet')) return 'ESnippet';
  
  return null;
}

/**
 * Извлечь data-атрибуты из элемента
 */
function extractDataAttributes(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  
  for (const attr of Array.from(element.attributes)) {
    if (attr.name.startsWith('data-')) {
      attrs[attr.name] = attr.value;
    }
  }
  
  return attrs;
}

/**
 * Генератор уникальных ID
 */
let elementIdCounter = 0;
function generateElementId(): string {
  return `pe-${++elementIdCounter}`;
}

/**
 * Сбросить счётчик ID (для тестов)
 */
export function resetElementIdCounter(): void {
  elementIdCounter = 0;
}

/**
 * Рекурсивный парсинг структуры DOM
 */
function parseElementRecursive(
  element: Element,
  depth: number,
  order: number,
  dataMap: Map<Element, CSVRow>
): PageElement | null {
  const type = detectElementType(element);
  if (!type) return null;
  
  const id = generateElementId();
  const data = dataMap.get(element) || {};
  const cssClasses = element.className.split(/\s+/).filter(Boolean);
  const dataAttributes = extractDataAttributes(element);
  
  const pageElement: PageElement = {
    id,
    type,
    data,
    order,
    depth,
    cssClasses,
    dataAttributes,
  };
  
  // Если это группа — ищем вложенные элементы
  if (isGroupType(type)) {
    const children: PageElement[] = [];
    let childOrder = 0;
    
    // Ищем прямых потомков-сниппетов
    for (const child of Array.from(element.children)) {
      const childElement = parseElementRecursive(
        child, 
        depth + 1, 
        childOrder, 
        dataMap
      );
      if (childElement) {
        children.push(childElement);
        childOrder++;
      }
    }
    
    if (children.length > 0) {
      pageElement.children = children;
    }
  }
  
  return pageElement;
}

/**
 * Создать Map для быстрого доступа к данным по элементу
 * Сопоставляет DOM элементы с распарсенными данными
 */
function buildDataMap(
  doc: Document, 
  rows: CSVRow[]
): Map<Element, CSVRow> {
  const dataMap = new Map<Element, CSVRow>();
  
  // Находим все контейнеры сниппетов
  const containers = doc.querySelectorAll([
    '.EOfferItem',
    '[class*="EProductSnippet2"]',
    '.EShopItem',
    '.ProductTile-Item',
    '[class*="Organic_withOfferInfo"]',
    '[class*="Organic"]',
    '.ESnippet',
  ].join(', '));
  
  // Сопоставляем контейнеры с данными по порядку
  // (snippet-parser возвращает данные в том же порядке, что и DOM)
  let rowIndex = 0;
  for (const container of Array.from(containers)) {
    if (rowIndex < rows.length) {
      dataMap.set(container, rows[rowIndex]);
      rowIndex++;
    }
  }
  
  Logger.debug(`[Structure] DataMap: ${dataMap.size} элементов сопоставлено с ${rows.length} строками`);
  
  return dataMap;
}

/**
 * Извлечь метаданные страницы
 */
function extractPageMeta(doc: Document, rows: CSVRow[]): PageMeta {
  // Пытаемся найти поисковый запрос
  let query = '';
  
  // Из input поиска
  const searchInput = doc.querySelector('input[name="text"], input.search__input');
  if (searchInput) {
    query = (searchInput as HTMLInputElement).value || '';
  }
  
  // Из данных (первая строка)
  if (!query && rows.length > 0 && rows[0]['#query']) {
    query = rows[0]['#query'];
  }
  
  // Определяем платформу
  const isTouchUA = doc.documentElement.className.includes('touch') ||
                    doc.body?.className.includes('touch');
  const platform = isTouchUA ? 'touch' : 'desktop';
  
  return {
    query,
    platform,
    totalResults: rows.length,
    source: 'yandex-serp',
  };
}

/**
 * Основная функция парсинга структуры страницы
 * 
 * @param html - HTML контент страницы
 * @returns Структура страницы с элементами и метаданными
 */
export async function parsePageStructure(html: string): Promise<PageStructure> {
  const startTime = Date.now();
  resetElementIdCounter();
  
  Logger.info('[Structure] Начинаем парсинг структуры страницы...');
  
  // 1. Парсим данные через существующий snippet-parser
  const { rows } = await parseYandexSearchResults(html);
  Logger.info(`[Structure] Получено ${rows.length} строк данных`);
  
  // 2. Парсим DOM для структуры
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // 3. Строим карту данных
  const dataMap = buildDataMap(doc, rows);
  
  // 4. Извлекаем метаданные
  const meta = extractPageMeta(doc, rows);
  
  // 5. Находим корневой контейнер результатов
  const serpList = doc.querySelector('.serp-list, .content__left, .main');
  
  // 6. Парсим структуру
  const elements: PageElement[] = [];
  let order = 0;
  
  if (serpList) {
    // Парсим из корневого контейнера
    for (const child of Array.from(serpList.children)) {
      const element = parseElementRecursive(child, 0, order, dataMap);
      if (element) {
        elements.push(element);
        order++;
      }
    }
  } else {
    // Fallback: ищем все top-level сниппеты
    Logger.warn('[Structure] Корневой контейнер не найден, ищем все сниппеты');
    
    for (const [, row] of dataMap) {
      const type = (row['#SnippetType'] as SnippetType) || 'Organic';
      elements.push({
        id: generateElementId(),
        type,
        data: row,
        order: order++,
        depth: 0,
      });
    }
  }
  
  // 7. Собираем статистику
  const byType: Record<string, number> = {};
  let groupCount = 0;
  
  function countElements(els: PageElement[]): void {
    for (const el of els) {
      byType[el.type] = (byType[el.type] || 0) + 1;
      if (isGroupType(el.type)) {
        groupCount++;
      }
      if (el.children) {
        countElements(el.children);
      }
    }
  }
  countElements(elements);
  
  const parseTime = Date.now() - startTime;
  
  const stats: ParsingStats = {
    totalElements: elements.length,
    byType,
    groupCount,
    parseTime,
  };
  
  Logger.info(`[Structure] Парсинг завершён: ${elements.length} элементов за ${parseTime.toFixed(2)}ms`);
  Logger.debug(`[Structure] По типам:`, byType);
  
  return {
    elements,
    meta,
    stats,
  };
}

/**
 * Преобразовать плоский список элементов в иерархию групп
 * 
 * Группирует последовательные элементы одного типа в группы,
 * если количество превышает порог
 */
export function groupSequentialElements(
  elements: PageElement[],
  minGroupSize: number = 2
): PageElement[] {
  const result: PageElement[] = [];
  let currentGroup: PageElement[] = [];
  let currentType: string | null = null;
  
  for (const element of elements) {
    if (element.type === currentType) {
      currentGroup.push(element);
    } else {
      // Flush current group
      if (currentGroup.length >= minGroupSize && currentType) {
        // Создаём группу
        const groupType = getGroupTypeForSnippet(currentType as SnippetType);
        if (groupType) {
          result.push({
            id: generateElementId(),
            type: groupType,
            data: {},
            order: result.length,
            depth: 0,
            children: currentGroup.map((el, idx) => ({
              ...el,
              order: idx,
              depth: 1,
            })),
          });
        } else {
          result.push(...currentGroup);
        }
      } else {
        result.push(...currentGroup);
      }
      
      // Start new group
      currentGroup = [element];
      currentType = element.type;
    }
  }
  
  // Flush last group
  if (currentGroup.length >= minGroupSize && currentType) {
    const groupType = getGroupTypeForSnippet(currentType as SnippetType);
    if (groupType) {
      result.push({
        id: generateElementId(),
        type: groupType,
        data: {},
        order: result.length,
        depth: 0,
        children: currentGroup.map((el, idx) => ({
          ...el,
          order: idx,
          depth: 1,
        })),
      });
    } else {
      result.push(...currentGroup);
    }
  } else {
    result.push(...currentGroup);
  }
  
  return result;
}

/**
 * Определить тип группы для типа сниппета
 */
function getGroupTypeForSnippet(snippetType: SnippetType): GroupType | null {
  switch (snippetType) {
    case 'EShopItem':
      return 'EShopGroup';
    case 'EOfferItem':
      return 'EOfferGroup';
    case 'ProductTile-Item':
      return 'ProductTileRow';
    case 'Organic':
    case 'Organic_withOfferInfo':
      return 'OrganicBlock';
    default:
      return null;
  }
}

// ============================================================================
// НОВОЕ API: Группировка по serpItemId и containerType
// ============================================================================

/**
 * Группировка сниппетов из одного serp-item (data-cid)
 */
interface SerpItemGroup {
  serpItemId: string;
  containerType: ContainerType | null;
  snippets: CSVRow[];
  order: number; // Порядок первого сниппета в этой группе
}

/**
 * Группировать сниппеты по #serpItemId
 * 
 * Сниппеты с одинаковым serpItemId объединяются в одну группу.
 * Порядок групп определяется порядком появления первого сниппета.
 */
export function groupSnippetsBySerpItem(rows: CSVRow[]): SerpItemGroup[] {
  const groupMap = new Map<string, SerpItemGroup>();
  const orderMap = new Map<string, number>();
  
  rows.forEach((row, index) => {
    const serpItemId = row['#serpItemId'] || '';
    const containerType = row['#containerType'] as ContainerType | undefined;
    
    // Если нет serpItemId — каждый сниппет отдельная "группа"
    const groupKey = serpItemId || `standalone-${index}`;
    
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        serpItemId: serpItemId,
        containerType: containerType && isContainerType(containerType) ? containerType : null,
        snippets: [],
        order: orderMap.size,
      });
      orderMap.set(groupKey, index);
    }
    
    groupMap.get(groupKey)!.snippets.push(row);
  });
  
  // Сортируем по порядку появления
  const groups = Array.from(groupMap.values());
  groups.sort((a, b) => a.order - b.order);
  
  Logger.info(`[Structure] Сгруппировано ${rows.length} сниппетов в ${groups.length} групп`);
  
  return groups;
}

/**
 * Преобразовать группы сниппетов в структуру для Page Builder
 */
export function buildSerpStructure(rows: CSVRow[], platform: 'desktop' | 'touch' = 'desktop'): SerpPageStructure {
  const groups = groupSnippetsBySerpItem(rows);
  const contentLeft: StructureNode[] = [];
  let nodeIdCounter = 0;
  
  const byType: Record<string, number> = {};
  let totalSnippets = 0;
  let containersCount = 0;
  
  for (const group of groups) {
    if (group.snippets.length === 1 && !group.containerType) {
      // Одиночный сниппет без контейнера
      const row = group.snippets[0];
      const snippetType = (row['#SnippetType'] as SnippetType) || 'Organic';
      
      contentLeft.push({
        id: `sn-${++nodeIdCounter}`,
        type: snippetType,
        data: row,
        order: contentLeft.length,
      });
      
      byType[snippetType] = (byType[snippetType] || 0) + 1;
      totalSnippets++;
    } else if (group.containerType) {
      // Группа с контейнером
      const children: StructureNode[] = group.snippets.map((row, idx) => {
        const snippetType = (row['#SnippetType'] as SnippetType) || 'Organic';
        byType[snippetType] = (byType[snippetType] || 0) + 1;
        totalSnippets++;
        
        return {
          id: `sn-${++nodeIdCounter}`,
          type: snippetType,
          data: row,
          order: idx,
        };
      });
      
      contentLeft.push({
        id: `ct-${++nodeIdCounter}`,
        type: group.containerType,
        children,
        order: contentLeft.length,
      });
      
      containersCount++;
    } else {
      // Несколько сниппетов без контейнера — добавляем по одному
      for (const row of group.snippets) {
        const snippetType = (row['#SnippetType'] as SnippetType) || 'Organic';
        
        contentLeft.push({
          id: `sn-${++nodeIdCounter}`,
          type: snippetType,
          data: row,
          order: contentLeft.length,
        });
        
        byType[snippetType] = (byType[snippetType] || 0) + 1;
        totalSnippets++;
      }
    }
  }
  
  // Извлекаем query из первой строки
  const query = rows.length > 0 ? (rows[0]['#query'] || '') : '';
  
  Logger.info(`[Structure] Структура: ${totalSnippets} сниппетов, ${containersCount} контейнеров`);
  Logger.debug(`[Structure] По типам:`, byType);
  
  return {
    meta: {
      query,
      platform,
      totalResults: totalSnippets,
      source: 'yandex-serp',
    },
    contentLeft,
    contentRight: [], // Пока не используется
    stats: {
      totalSnippets,
      byType,
      containers: containersCount,
    },
  };
}

/**
 * Основная функция: парсинг HTML в структуру страницы
 * 
 * Использует существующий snippet-parser для извлечения данных,
 * затем группирует по serpItemId и containerType.
 */
export async function parseSerpPage(html: string): Promise<SerpPageStructure> {
  const startTime = Date.now();
  
  // 1. Определяем платформу
  const platform = detectPlatformFromHtml(html);
  Logger.info(`[Structure] Платформа: ${platform}`);
  
  // 2. Парсим данные
  const { rows, error } = parseYandexSearchResults(html);
  if (error) {
    Logger.error(`[Structure] Ошибка парсинга: ${error}`);
  }
  Logger.info(`[Structure] Получено ${rows.length} строк данных`);
  
  // 3. Строим структуру
  const structure = buildSerpStructure(rows, platform);
  
  const parseTime = Date.now() - startTime;
  Logger.info(`[Structure] Парсинг завершён за ${parseTime}ms`);
  
  return structure;
}

