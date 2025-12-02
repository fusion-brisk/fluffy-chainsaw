// DOM utilities for parsing HTML

import { STYLE_TAG_REGEX, STYLE_TAG_CONTENT_REGEX } from './regex';

// Находит все контейнеры сниппетов в документе
// Главный критерий: наличие цены в сниппете
// ОПТИМИЗИРОВАНО (Phase 5): один комбинированный селектор
export function findSnippetContainers(doc: Document): Element[] {
  // Комбинированный селектор для всех типов сниппетов с ценой
  // ВАЖНО: для EShopItem используем .EShopItem (точный класс), 
  // а не [class*="EShopItem"] — последний захватывает дочерние элементы типа EShopItem-Title
  const combinedSelector = [
    '[class*="Organic_withOfferInfo"]',   // Органик с офером (цена, магазин)
    '[class*="EProductSnippet2"]',        // Сниппеты товаров (новый формат)
    '.EShopItem',                         // Карточки магазинов Маркета (точный класс!)
    '.ProductTile-Item',                  // Карточки в плитке товаров
    '[class*="ProductTile-Item"]'
  ].join(', ');
  
  const containers = doc.querySelectorAll(combinedSelector);
  
  // Дедупликация через Set
  const containersSet = new Set<Element>();
  for (let i = 0; i < containers.length; i++) {
    containersSet.add(containers[i]);
  }
  
  return Array.from(containersSet);
}

// Фильтрует контейнеры, оставляя только верхнеуровневые (не вложенные)
// ОПТИМИЗИРОВАНО: использует Set для быстрой проверки + сортировку по глубине DOM
export function filterTopLevelContainers(containers: Element[]): Element[] {
  if (containers.length <= 1) return containers;
  
  // Создаём Set для быстрой проверки принадлежности
  const containerSet = new Set(containers);
  const topLevelContainers: Element[] = [];
  
  for (const container of containers) {
    // Проверяем родителей до корня — если встретим другой контейнер, значит вложенный
    let isNested = false;
    let parent: Element | null = container.parentElement;
    
    // Ограничиваем глубину поиска для производительности
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
      topLevelContainers.push(container);
    }
  }
  
  return topLevelContainers;
}

// Проверяет, находится ли контейнер внутри рекламной галереи
export function isInsideAdvProductGallery(container: Element): boolean {
  let parent: Element | null = container.parentElement;
  
  while (parent) {
    if (parent.classList.contains('AdvProductGallery') || 
        parent.className.includes('AdvProductGallery')) {
      return true;
    }
    parent = parent.parentElement;
  }
  
  return false;
}

// Извлекает URL продукта из контейнера
export function extractProductURL(container: Element): string {
  const productLink: Element | null =
    // EProductSnippet2
    container.querySelector('.EProductSnippet2-Overlay[href], .EProductSnippet2-Overlay [href]') ||
    container.querySelector('.EProductSnippet2 a[href], [data-href]') ||
    // EShopItem — ссылка в кнопке или в заголовке
    container.querySelector('.EShopItem-ButtonLink[href], [class*="EShopItem-ButtonLink"][href]') ||
    container.querySelector('.EShopItem-Title a[href], [class*="EShopItem-Title"] a[href]') ||
    container.querySelector('.EShopItem a[href]') ||
    // Organic_withOfferInfo — ссылка в заголовке (OrganicTitle) или кнопке Checkout
    container.querySelector('.OrganicTitle a[href], [class*="OrganicTitle"] a[href]') ||
    container.querySelector('.Organic-Title a[href], [class*="Organic-Title"] a[href]') ||
    container.querySelector('.Organic-Checkout a[href], [class*="Organic-Checkout"] a[href]') ||
    // ProductTile-Item — ссылка в карточке
    container.querySelector('.ProductTile-Item a[href], [class*="ProductTile"] a[href]') ||
    // Общий fallback
    container.querySelector('a[href], [data-href]');

  if (productLink) {
    const hrefAttr = productLink.getAttribute('href') || productLink.getAttribute('data-href');
    if (hrefAttr) {
      return hrefAttr.startsWith('http') ? hrefAttr : `https:${hrefAttr}`;
    }
  }
  
  return '';
}

// Вспомогательная функция для получения style тегов из документа
// Пробует разные способы поиска, так как DOMParser может не всегда правильно парсить style теги
// Также принимает rawHtml для поиска в сыром HTML, если парсинг не находит теги
export function getStyleTags(doc: Document, rawHtml?: string): HTMLStyleElement[] {
  // Пробуем стандартный способ
  const allStyleTags = doc.querySelectorAll('style');
  if (allStyleTags.length > 0) {
    console.log(`✅ [getStyleTags] Найдено ${allStyleTags.length} style тегов через querySelectorAll`);
    return Array.from(allStyleTags);
  }
  
  // Пробуем через head
  const headElement = doc.head;
  if (headElement) {
    const headStyleTags = headElement.querySelectorAll('style');
    if (headStyleTags.length > 0) {
      console.log(`✅ [getStyleTags] Найдено ${headStyleTags.length} style тегов в head`);
      return Array.from(headStyleTags);
    }
  }
  
  // Пробуем через body
  const bodyElement = doc.body;
  if (bodyElement) {
    const bodyStyleTags = bodyElement.querySelectorAll('style');
    if (bodyStyleTags.length > 0) {
      console.log(`✅ [getStyleTags] Найдено ${bodyStyleTags.length} style тегов в body`);
      return Array.from(bodyStyleTags);
    }
  }
  
  // Если не нашли через querySelectorAll, пробуем через innerHTML
  const htmlContent = doc.documentElement ? doc.documentElement.innerHTML : '';
  let styleMatches = htmlContent.match(STYLE_TAG_REGEX);
  
  // Если не нашли в innerHTML, пробуем в сыром HTML (если передан)
  if ((!styleMatches || styleMatches.length === 0) && rawHtml) {
    console.log(`⚠️ [getStyleTags] Не найдено style тегов в parsed HTML, пробуем в сыром HTML...`);
    styleMatches = rawHtml.match(STYLE_TAG_REGEX);
    if (styleMatches && styleMatches.length > 0) {
      console.log(`✅ [getStyleTags] Найдено ${styleMatches.length} style тегов в сыром HTML`);
    }
  }
  
  if (styleMatches && styleMatches.length > 0) {
    // Создаем временные style элементы из найденных совпадений
    const tempStyleElements: HTMLStyleElement[] = [];
    for (let i = 0; i < styleMatches.length; i++) {
      const match = styleMatches[i];
      const contentMatch = match.match(STYLE_TAG_CONTENT_REGEX);
      if (contentMatch && contentMatch[1]) {
        const styleElement = doc.createElement('style');
        styleElement.textContent = contentMatch[1];
        tempStyleElements.push(styleElement);
      }
    }
    if (tempStyleElements.length > 0) {
      console.log(`✅ [getStyleTags] Создано ${tempStyleElements.length} временных style элементов из найденных совпадений`);
      return tempStyleElements;
    }
  }
  
  console.log(`⚠️ [getStyleTags] Не найдено style тегов ни одним способом`);
  return Array.from(allStyleTags); // Возвращаем пустой массив
}

