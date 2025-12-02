// DOM cache utilities for optimized element lookup
// Phase 5 optimization: single pass DOM traversal

/**
 * Кэш элементов контейнера сниппета
 * Один обход TreeWalker -> Map lookup O(1) вместо множественных querySelector O(n)
 */
export interface ContainerCache {
  element: Element;
  // className -> Element[] (все элементы с этим классом)
  byClass: Map<string, Element[]>;
  // Первый элемент по классу (оптимизация для частых случаев)
  firstByClass: Map<string, Element>;
  // Элементы по тегу
  byTag: Map<string, Element[]>;
  // Статистика
  stats: {
    totalElements: number;
    totalClasses: number;
  };
}

/**
 * Глобальный кэш DOM для документа
 */
export interface DOMCache {
  // Кэшированные контейнеры сниппетов
  containers: ContainerCache[];
  // Статистика
  stats: {
    totalContainers: number;
    totalElements: number;
    buildTimeMs: number;
  };
}

/**
 * Паттерны классов для поиска (компилируем один раз)
 */
const CLASS_PATTERNS = {
  // Контейнеры сниппетов
  // ВАЖНО: для EShopItem использовать точный класс, а не подстроку
  // чтобы не захватывать дочерние элементы типа EShopItem-Title
  containers: [
    'Organic_withOfferInfo',
    'EProductSnippet2',
    'EShopItem'  // Поиск по точному классу, не по подстроке
  ],
  // Часто используемые классы в extractRowData
  frequent: [
    'OrganicTitle',
    'EProductSnippet2-Title',
    'EShopName',
    'ShopName',
    'Path',
    'OrganicTextContentSpan',
    'EProductSnippet2-Text',
    'Organic-OfferThumbImage',
    'EProductSnippet2-Thumb',
    'EPriceGroup',
    'EPriceGroup-Pair',
    'EPriceGroup-Price',
    'EPrice-Value',
    'EPrice-Currency',
    'EPrice_view_old',
    'LabelDiscount',
    'Label-Content',
    'Rating',
    'Review',
    'Reviews',
    'ELabelRating',
    'LabelRating',
    'EPriceBarometer',
    'EProductSnippet2-Overlay',
    'AdvProductGallery',
    'AdvProductGalleryCard',
    'Organic-Label_type_advertisement',
    'Organic-Subtitle_type_advertisement',
    'Favicon',
    'ImagePlaceholder',
    'Image-Placeholder',
    'FaviconImage',
    'OrganicHost'
  ]
};

/**
 * Строит кэш элементов для одного контейнера
 * Использует TreeWalker для единственного прохода по DOM
 */
export function buildContainerCache(container: Element): ContainerCache {
  const startTime = performance.now();
  
  const byClass = new Map<string, Element[]>();
  const firstByClass = new Map<string, Element>();
  const byTag = new Map<string, Element[]>();
  
  let totalElements = 0;
  
  // TreeWalker для обхода всех элементов
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_ELEMENT,
    null
  );
  
  // Обрабатываем сам контейнер
  processElement(container, byClass, firstByClass, byTag);
  totalElements++;
  
  // Обходим все дочерние элементы
  let node: Node | null;
  while ((node = walker.nextNode()) !== null) {
    const el = node as Element;
    processElement(el, byClass, firstByClass, byTag);
    totalElements++;
  }
  
  const buildTime = performance.now() - startTime;
  if (buildTime > 5) {
    console.log(`⏱️ [ContainerCache] Построен за ${buildTime.toFixed(2)}ms, ${totalElements} элементов`);
  }
  
  return {
    element: container,
    byClass,
    firstByClass,
    byTag,
    stats: {
      totalElements,
      totalClasses: byClass.size
    }
  };
}

/**
 * Обрабатывает один элемент, добавляя его в кэши
 */
function processElement(
  el: Element,
  byClass: Map<string, Element[]>,
  firstByClass: Map<string, Element>,
  byTag: Map<string, Element[]>
): void {
  // Индексируем по классам
  const classList = el.classList;
  if (classList && classList.length > 0) {
    for (let i = 0; i < classList.length; i++) {
      const className = classList[i];
      
      // Добавляем в массив
      const existing = byClass.get(className);
      if (existing) {
        existing.push(el);
      } else {
        byClass.set(className, [el]);
        firstByClass.set(className, el);
      }
    }
  }
  
  // Также индексируем по className (для поиска по подстроке)
  const fullClassName = el.className;
  if (typeof fullClassName === 'string' && fullClassName.length > 0) {
    // Проверяем часто используемые паттерны
    for (const pattern of CLASS_PATTERNS.frequent) {
      if (fullClassName.includes(pattern)) {
        const patternKey = `*${pattern}*`;
        const existing = byClass.get(patternKey);
        if (existing) {
          existing.push(el);
        } else {
          byClass.set(patternKey, [el]);
          firstByClass.set(patternKey, el);
        }
      }
    }
  }
  
  // Индексируем по тегу
  const tagName = el.tagName.toLowerCase();
  const tagElements = byTag.get(tagName);
  if (tagElements) {
    tagElements.push(el);
  } else {
    byTag.set(tagName, [el]);
  }
}

/**
 * Быстрый поиск элемента по классу из кэша
 * Поддерживает:
 * - Точное совпадение: ".ClassName"
 * - Подстрока: "[class*=\"ClassName\"]"
 */
export function queryFromCache(
  cache: ContainerCache,
  selector: string
): Element | null {
  // Парсим селектор
  const parsed = parseSimpleSelector(selector);
  if (!parsed) {
    // Fallback на querySelector для сложных селекторов
    return cache.element.querySelector(selector);
  }
  
  const { className, isPartial, tag, isNegation } = parsed;
  
  if (isNegation) {
    // Для негативных селекторов используем стандартный querySelector
    return cache.element.querySelector(selector);
  }
  
  if (className) {
    if (isPartial) {
      // Поиск по подстроке класса
      const patternKey = `*${className}*`;
      return cache.firstByClass.get(patternKey) || null;
    } else {
      // Точный поиск по классу
      return cache.firstByClass.get(className) || null;
    }
  }
  
  if (tag) {
    const tagElements = cache.byTag.get(tag.toLowerCase());
    return tagElements && tagElements.length > 0 ? tagElements[0] : null;
  }
  
  return null;
}

/**
 * Быстрый поиск всех элементов по классу из кэша
 */
export function queryAllFromCache(
  cache: ContainerCache,
  selector: string
): Element[] {
  const parsed = parseSimpleSelector(selector);
  if (!parsed) {
    return Array.from(cache.element.querySelectorAll(selector));
  }
  
  const { className, isPartial, tag, isNegation } = parsed;
  
  if (isNegation) {
    return Array.from(cache.element.querySelectorAll(selector));
  }
  
  if (className) {
    if (isPartial) {
      const patternKey = `*${className}*`;
      return cache.byClass.get(patternKey) || [];
    } else {
      return cache.byClass.get(className) || [];
    }
  }
  
  if (tag) {
    return cache.byTag.get(tag.toLowerCase()) || [];
  }
  
  return [];
}

/**
 * Комбинированный поиск: пробует несколько селекторов
 * Эквивалент querySelector с несколькими вариантами через запятую
 */
export function queryFirstMatch(
  cache: ContainerCache,
  selectors: string[]
): Element | null {
  for (const selector of selectors) {
    const result = queryFromCache(cache, selector);
    if (result) return result;
  }
  return null;
}

/**
 * Интерфейс для результата парсинга селектора
 */
interface ParsedSelector {
  className: string | null;
  isPartial: boolean;
  tag: string | null;
  isNegation: boolean;
}

/**
 * Парсит простые CSS селекторы для быстрого lookup
 */
function parseSimpleSelector(selector: string): ParsedSelector | null {
  const trimmed = selector.trim();
  
  // Негативные селекторы (:not)
  if (trimmed.includes(':not')) {
    return { className: null, isPartial: false, tag: null, isNegation: true };
  }
  
  // Селектор по классу: .ClassName
  if (trimmed.startsWith('.') && !trimmed.includes(' ') && !trimmed.includes('[')) {
    return {
      className: trimmed.substring(1),
      isPartial: false,
      tag: null,
      isNegation: false
    };
  }
  
  // Селектор по подстроке класса: [class*="ClassName"]
  const partialMatch = trimmed.match(/^\[class\*=["']([^"']+)["']\]$/);
  if (partialMatch) {
    return {
      className: partialMatch[1],
      isPartial: true,
      tag: null,
      isNegation: false
    };
  }
  
  // Простой селектор по тегу (без классов, атрибутов и т.д.)
  if (/^[a-z]+$/i.test(trimmed)) {
    return {
      className: null,
      isPartial: false,
      tag: trimmed,
      isNegation: false
    };
  }
  
  // Сложные селекторы не поддерживаем
  return null;
}

/**
 * Находит все контейнеры сниппетов с помощью оптимизированного селектора
 * Заменяет findSnippetContainers из dom-utils.ts
 */
export function findSnippetContainersOptimized(doc: Document): Element[] {
  // ВАЖНО: для EShopItem используем точный класс .EShopItem, 
  // а не [class*="EShopItem"] — последний захватывает дочерние элементы
  const combinedSelector = [
    '[class*="Organic_withOfferInfo"]',
    '[class*="EProductSnippet2"]',
    '.EShopItem'  // Точный класс, не подстрока!
  ].join(', ');
  
  const containers = doc.querySelectorAll(combinedSelector);
  
  // Дедупликация через Set
  const uniqueContainers = new Set<Element>();
  for (let i = 0; i < containers.length; i++) {
    uniqueContainers.add(containers[i]);
  }
  
  return Array.from(uniqueContainers);
}

/**
 * Строит глобальный кэш DOM для всех контейнеров
 */
export function buildDOMCache(doc: Document): DOMCache {
  const startTime = performance.now();
  
  // Находим контейнеры
  const rawContainers = findSnippetContainersOptimized(doc);
  
  // Фильтруем вложенные (оставляем только top-level)
  const topLevelContainers = filterTopLevelOptimized(rawContainers);
  
  // Строим кэш для каждого контейнера
  const containerCaches: ContainerCache[] = [];
  let totalElements = 0;
  
  for (const container of topLevelContainers) {
    const cache = buildContainerCache(container);
    containerCaches.push(cache);
    totalElements += cache.stats.totalElements;
  }
  
  const buildTime = performance.now() - startTime;
  
  console.log(`✅ [DOMCache] Построен за ${buildTime.toFixed(2)}ms: ${topLevelContainers.length} контейнеров, ${totalElements} элементов`);
  
  return {
    containers: containerCaches,
    stats: {
      totalContainers: containerCaches.length,
      totalElements,
      buildTimeMs: buildTime
    }
  };
}

/**
 * Оптимизированная фильтрация вложенных контейнеров
 * ОПТИМИЗИРОВАНО: O(n * глубина DOM) вместо O(n²)
 * Используем Set для быстрой проверки + обход родителей вверх
 */
function filterTopLevelOptimized(containers: Element[]): Element[] {
  if (containers.length <= 1) return containers;
  
  // Создаём Set для быстрой проверки принадлежности O(1)
  const containerSet = new Set(containers);
  const topLevel: Element[] = [];
  
  for (const container of containers) {
    // Проверяем родителей до корня — если встретим другой контейнер, значит вложенный
    let isNested = false;
    let parent: Element | null = container.parentElement;
    
    // Ограничиваем глубину для защиты от слишком глубокого DOM
    let depth = 0;
    const maxDepth = 50;
    
    while (parent && depth < maxDepth) {
      if (containerSet.has(parent)) {
        isNested = true;
        break;
      }
      parent = parent.parentElement;
      depth++;
    }
    
    if (!isNested) {
      topLevel.push(container);
    }
  }
  
  return topLevel;
}

/**
 * Проверяет, содержит ли кэш элемент с указанным классом
 */
export function hasClass(cache: ContainerCache, className: string): boolean {
  return cache.byClass.has(className) || cache.byClass.has(`*${className}*`);
}

/**
 * Получает текстовое содержимое первого элемента с указанным классом
 */
export function getTextByClass(cache: ContainerCache, className: string): string {
  const el = cache.firstByClass.get(className) || cache.firstByClass.get(`*${className}*`);
  return el ? (el.textContent || '').trim() : '';
}

