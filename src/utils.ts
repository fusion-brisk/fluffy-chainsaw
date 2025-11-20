// Utility functions for UI

import { Config, SheetData, CSVRow } from './types';

export const CONFIG: Config = {
  CORS_PROXY: 'https://proxy.cors.sh/',
  CORS_KEY: 'live_ad2976dadc87176d0acc2af12774c65db5ef345ea278a779350258330573dde4',
  FETCH_TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 2,
  RETRY_DELAY: 1000 // 1 second
};

export const SPREADSHEET_ID = '1Qk6Lki3Jm88lBA04YmW7LKfKKbKFPJm9O3Vq3yQsOhw';
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxNjv0lTBwBOjE9QI2WOT0eViw_kikZ1bX65L28fIXGIlsyauYe0Jlf5dTXnHlF7iwYyg/exec';

// Logging function with timestamp
export function log(message: string, logArea?: HTMLTextAreaElement): void {
  const timestamp = new Date().toLocaleTimeString();
  if (logArea) {
    logArea.value += `[${timestamp}] ${message}\n`;
    logArea.scrollTop = logArea.scrollHeight;
  }
  console.log(`[${timestamp}] ${message}`);
}

// Compiled regex for encoding detection (оптимизация: компилируем заранее)
const ENCODING_BAD_CHARS_REGEX = /[ÐÑÐÐÐÐÐÐÐÐÐÐÐÐÐÐÐÐ]/;

// Fix encoding issues: convert incorrectly decoded UTF-8 text (interpreted as Latin-1) back to UTF-8
// Example: "ÐÐ¸Ð½Ð¸" -> "Мини"
export function fixEncoding(text: string): string {
  if (!text) return text;
  
  try {
    // Проверяем, есть ли признаки неправильной кодировки (символы типа Ð, Ñ, Ð°)
    if (!ENCODING_BAD_CHARS_REGEX.test(text)) {
      return text; // Похоже, что кодировка правильная
    }
    
    // Пробуем исправить: конвертируем строку как Latin-1 в байты, затем интерпретируем как UTF-8
    // Это работает, когда UTF-8 текст был прочитан как Latin-1
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      bytes[i] = text.charCodeAt(i);
    }
    
    // Используем TextDecoder для правильной интерпретации UTF-8
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const fixed = decoder.decode(bytes);
    
    // Проверяем, что результат лучше (меньше странных символов)
    const originalBadChars = (text.match(ENCODING_BAD_CHARS_REGEX) || []).length;
    const fixedBadChars = (fixed.match(ENCODING_BAD_CHARS_REGEX) || []).length;
    
    if (fixedBadChars < originalBadChars) {
      return fixed;
    }
    
    return text;
  } catch (e) {
    // Если не удалось исправить, возвращаем оригинал
    return text;
  }
}

// Helper function для извлечения текста с автоматическим исправлением кодировки
function getTextContent(element: Element | null): string {
  if (!element) return '';
  const text = (element.textContent || '').trim();
  return fixEncoding(text);
}

// Fetch with retry logic
export async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  attempt: number = 0
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    return response;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    
    if (attempt < CONFIG.RETRY_ATTEMPTS) {
      console.log(`Retrying request (${attempt + 1}/${CONFIG.RETRY_ATTEMPTS})...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
      return fetchWithRetry(url, options, attempt + 1);
    }
    
    throw error;
  }
}

// Load pages list from Figma document
export async function loadPagesList(): Promise<string[]> {
  try {
    console.log('📄 Loading pages list from Figma...');
    
    // Send message to plugin to get pages
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('❌ Timeout waiting for pages list');
        reject(new Error('Timeout waiting for pages list'));
      }, 10000); // Увеличиваем timeout до 10 секунд
      
      const handleMessage = (event: MessageEvent) => {
        console.log('📄 Received message:', event.data);
        const msg = event.data.pluginMessage;
        if (msg && msg.type === 'pages-list') {
          clearTimeout(timeout);
          window.removeEventListener('message', handleMessage);
          console.log('📄 Received pages list:', msg.pages);
          resolve(msg.pages || []);
        }
      };
      
      window.addEventListener('message', handleMessage);
      
      // Request pages from plugin
      console.log('📄 Sending get-pages request to plugin...');
      sendMessageToPlugin({ type: 'get-pages' });
    });
    
  } catch (error) {
    console.error('❌ Error loading pages list:', error);
    throw error;
  }
}

// Load sheets list from Google Sheets
export async function loadSheetsList(): Promise<string[]> {
  try {
    console.log('📋 Loading sheets list...');
    console.log('📋 APPS_SCRIPT_URL:', APPS_SCRIPT_URL);
    console.log('📋 SPREADSHEET_ID:', SPREADSHEET_ID);
    
    const url = `${APPS_SCRIPT_URL}?action=getSheets&spreadsheetId=${SPREADSHEET_ID}`;
    console.log('📋 Full URL:', url);
    
    const response = await fetchWithRetry(url, {});
    console.log('📋 Response status:', response.status);
    
    const data: SheetData = await response.json();
    console.log('📋 Response data:', data);
    
    if (data.ok && data.sheets) {
      console.log(`📋 Loaded ${data.sheets.length} sheets: ${data.sheets.join(', ')}`);
      return data.sheets;
    }
    
    throw new Error('Apps Script did not return sheets list');
    
  } catch (error) {
    console.error('❌ Error loading sheets:', error);
    
    // Fallback: use known sheets
    const fallbackSheets = ['Блендеры', 'Товары', 'Новости', 'Пользователи'];
    console.log(`📋 Using fallback sheets: ${fallbackSheets.join(', ')}`);
    return fallbackSheets;
  }
}

// Convert image URL to base64
async function convertImageToBase64(url: string): Promise<string | null> {
  try {
    console.log(`🖼️ Конвертируем изображение в base64: ${url}`);
    
    // Use CORS proxy for the image
    const proxiedUrl = CONFIG.CORS_PROXY + url;
    const response = await fetch(proxiedUrl, {
      headers: { 'x-cors-api-key': CONFIG.CORS_KEY }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        console.log(`✅ Изображение конвертировано в base64, размер: ${result.length} символов`);
        resolve(result);
      };
      reader.onerror = () => reject(new Error('Failed to convert image to base64'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`❌ Ошибка конвертации изображения ${url}:`, error);
    return null;
  }
}

// Process CSV rows for special parameters and image conversion
export async function processCSVRows(rows: CSVRow[]): Promise<CSVRow[]> {
  const processedRows: CSVRow[] = [];
  
  for (const row of rows) {
    const processedRow = { ...row };
    
    // Find image fields and convert them to base64
    const imageFields = Object.keys(row).filter(key => {
      const value = row[key];
      return typeof value === 'string' && 
             value.trim() !== '' && 
             (value.startsWith('http://') || value.startsWith('https://')) &&
             (value.includes('.jpg') || value.includes('.jpeg') || value.includes('.png') || value.includes('.gif') || value.includes('.webp'));
    });
    
    console.log(`🖼️ Найдено ${imageFields.length} полей изображений в строке: ${imageFields.join(', ')}`);
    
    // Convert each image field to base64
    for (const imageField of imageFields) {
      const imageUrl = row[imageField];
      console.log(`🖼️ Обрабатываем поле изображения "${imageField}": ${imageUrl}`);
      
      const base64Data = await convertImageToBase64(imageUrl);
      if (base64Data) {
        processedRow[imageField + '_base64'] = base64Data;
        console.log(`✅ Добавлено поле "${imageField}_base64"`);
      } else {
        console.log(`⚠️ Не удалось конвертировать изображение для поля "${imageField}"`);
      }
    }
    
    processedRows.push(processedRow);
  }
  
  return processedRows;
}

// Fisher-Yates shuffle algorithm
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Apply Figma theme
export function applyFigmaTheme(): void {
  try {
    // Try to get theme from Figma via postMessage
    parent.postMessage({ pluginMessage: { type: 'get-theme' } }, '*');
    
    // Fallback: use system theme
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    
    console.log(`Applied theme: ${prefersDark ? 'dark' : 'light'}`);
  } catch (error) {
    // If theme detection fails, use dark theme by default
    document.documentElement.setAttribute('data-theme', 'dark');
    console.log('Applied default theme: dark');
  }
}

// Send message to plugin
export function sendMessageToPlugin(message: any): void {
  try {
    if (typeof parent.postMessage !== 'function') {
      console.error('parent.postMessage is not available!');
      return;
    }
    
    parent.postMessage({ pluginMessage: message }, '*');
    console.log('Message sent to plugin:', message);
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

// Close plugin
export function closePlugin(): void {
  sendMessageToPlugin({ type: 'close' });
}

// Вспомогательные функции для парсинга Yandex результатов из HTML

// Находит все контейнеры сниппетов в документе
function findSnippetContainers(doc: Document): Element[] {
  const containersSet = new Set<Element>();
  const allContainers = [
    ...Array.from(doc.querySelectorAll('[class*="Organic_withOfferInfo"]')),
    ...Array.from(doc.querySelectorAll('[class*="EProductSnippet2"]')),
    ...Array.from(doc.querySelectorAll('[class*="EShopItem"]'))
  ];
  
  // Убираем дубликаты по DOM-элементу
  for (const container of allContainers) {
    containersSet.add(container);
  }
  
  return Array.from(containersSet);
}

// Фильтрует контейнеры, оставляя только верхнеуровневые (не вложенные)
function filterTopLevelContainers(containers: Element[]): Element[] {
  const topLevelContainers: Element[] = [];
  
  for (const container of containers) {
    let isNested = false;
    // Проверяем, не находится ли этот контейнер внутри другого контейнера
    for (const otherContainer of containers) {
      if (container === otherContainer) continue;
      if (otherContainer.contains(container)) {
        isNested = true;
        break;
      }
    }
    if (!isNested) {
      topLevelContainers.push(container);
    }
  }
  
  return topLevelContainers;
}

// Проверяет, находится ли контейнер внутри рекламной галереи
function isInsideAdvProductGallery(container: Element): boolean {
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
function extractProductURL(container: Element): string {
  const productLink: Element | null =
    container.querySelector('.EProductSnippet2-Overlay[href], .EProductSnippet2-Overlay [href]') ||
    container.querySelector('.EProductSnippet2 a[href], [data-href]') ||
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
function getStyleTags(doc: Document, rawHtml?: string): HTMLStyleElement[] {
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
  let styleMatches = htmlContent.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  
  // Если не нашли в innerHTML, пробуем в сыром HTML (если передан)
  if ((!styleMatches || styleMatches.length === 0) && rawHtml) {
    console.log(`⚠️ [getStyleTags] Не найдено style тегов в parsed HTML, пробуем в сыром HTML...`);
    styleMatches = rawHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    if (styleMatches && styleMatches.length > 0) {
      console.log(`✅ [getStyleTags] Найдено ${styleMatches.length} style тегов в сыром HTML`);
    }
  }
  
  if (styleMatches && styleMatches.length > 0) {
    // Создаем временные style элементы из найденных совпадений
    const tempStyleElements: HTMLStyleElement[] = [];
    for (let i = 0; i < styleMatches.length; i++) {
      const match = styleMatches[i];
      const contentMatch = match.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
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

// Извлекает фавиконку из контейнера
// spriteState - состояние текущего спрайта: { urls: string[], currentIndex: number } | null
// Возвращает обновленное состояние спрайта
function extractFavicon(
  container: Element, 
  doc: Document, 
  row: CSVRow,
  spriteState: { urls: string[]; currentIndex: number } | null,
  rawHtml?: string
): { urls: string[]; currentIndex: number } | null {
  try {
    const snippetTitle = row['#OrganicTitle']?.substring(0, 30) || 'unknown';
    console.log(`🔍 [FAVICON EXTRACT] Начало извлечения фавиконки для сниппета "${snippetTitle}..."`);
    
    // Пропускаем рекламные сниппеты из AdvProductGallery
    if (isInsideAdvProductGallery(container)) {
      console.log(`⚠️ [FAVICON EXTRACT] Сниппет "${snippetTitle}..." пропущен (рекламный)`);
      return spriteState; // Возвращаем состояние без изменений
    }
    
    // Ищем Favicon внутри всего контейнера сниппета
    let favEl = container.querySelector('.Favicon, [class*="Favicon"]') as HTMLElement | null;
    console.log(`🔍 [FAVICON EXTRACT] Поиск 1: favEl=${favEl ? `найден (${favEl.className})` : 'не найден'}`);
    
    // Если не нашли, попробуем найти через более специфичные селекторы
    if (!favEl) {
      const shopNameEl = container.querySelector('.EShopName, [class*="EShopName"], [class*="ShopName"]');
      if (shopNameEl) {
        favEl = shopNameEl.closest(container.tagName)?.querySelector('.Favicon, [class*="Favicon"]') as HTMLElement | null;
        if (favEl && !container.contains(favEl)) {
          favEl = null;
        }
        console.log(`🔍 [FAVICON EXTRACT] Поиск 2 (через EShopName): favEl=${favEl ? `найден (${favEl.className})` : 'не найден'}`);
      }
    }
    
    if (!favEl) {
      const imagePlaceholder = container.querySelector('[class*="ImagePlaceholder"], [class*="Image-Placeholder"]');
      if (imagePlaceholder) {
        favEl = imagePlaceholder.querySelector('.Favicon, [class*="Favicon"], [class*="FaviconImage"]') as HTMLElement | null;
        console.log(`🔍 [FAVICON EXTRACT] Поиск 3 (через ImagePlaceholder): favEl=${favEl ? `найден (${favEl.className})` : 'не найден'}`);
      }
    }
    
    if (!favEl || !container.contains(favEl)) {
      console.log(`⚠️ [FAVICON EXTRACT] Favicon элемент не найден для сниппета "${snippetTitle}..."`);
      // Если есть активный спрайт, используем следующую иконку из него
      if (spriteState && spriteState.currentIndex < spriteState.urls.length) {
        row['#FaviconImage'] = spriteState.urls[spriteState.currentIndex];
        console.log(`✅ [FAVICON EXTRACT] Использована фавиконка из спрайта: ${row['#FaviconImage']}`);
        spriteState.currentIndex++;
        return spriteState;
      }
      console.log(`⚠️ [FAVICON EXTRACT] Нет активного спрайта, row['#FaviconImage'] остается пустым`);
      return spriteState;
    }
    
    console.log(`✅ [FAVICON EXTRACT] Favicon элемент найден: className="${favEl.className}"`);
    
    // Извлекаем background-image из inline-стилей или CSS стилей документа
    let bgUrl: string | null = null;
    let bgPosition: string | null = null;
    let bgSizeValue: number | null = null; // Размер одной иконки из background-size
    
    // ПРИОРИТЕТ 1: Проверяем inline-стили (для MHTML файлов)
    const styleAttr = favEl.getAttribute('style') || '';
    console.log(`🔍 [FAVICON EXTRACT] Проверка inline-стилей: styleAttr="${styleAttr.substring(0, 100)}..."`);
    if (styleAttr) {
      const inlineBgMatch = styleAttr.match(/background-image\s*:\s*url\s*\(\s*([^)]+)\s*\)/i);
      if (inlineBgMatch && inlineBgMatch[1]) {
        bgUrl = inlineBgMatch[1].trim();
        // Декодируем HTML-сущности (например, &amp; -> &)
        bgUrl = bgUrl.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        // Убираем кавычки если есть
        bgUrl = bgUrl.replace(/^['"]|['"]$/g, '');
        console.log(`✅ [FAVICON EXTRACT] Найден URL фавиконки из inline-стиля: ${bgUrl.substring(0, 80)}...`);
      } else {
        console.log(`⚠️ [FAVICON EXTRACT] Не найден background-image в inline-стилях`);
      }
      
      // Извлекаем background-position из inline-стилей (может быть background-position или background-position-y)
      const inlinePosMatch = styleAttr.match(/background-position(?:-y)?\s*:\s*([^;]+)/i);
      if (inlinePosMatch && inlinePosMatch[1]) {
        bgPosition = inlinePosMatch[1].trim();
        console.log(`🔍 [FAVICON EXTRACT] Найден background-position из inline-стилей: "${bgPosition}"`);
      }
      
      // Извлекаем background-size из inline-стилей
      const inlineSizeMatch = styleAttr.match(/background-size\s*:\s*([^;]+)/i);
      if (inlineSizeMatch && inlineSizeMatch[1]) {
        const bgSizeStr = inlineSizeMatch[1].trim();
        const sizeValueMatches = bgSizeStr.match(/(\d+(?:\.\d+)?)px/g);
        if (sizeValueMatches && sizeValueMatches.length > 0) {
          // Берем первое значение (размер одной иконки)
          bgSizeValue = parseFloat(sizeValueMatches[0]);
          console.log(`🔍 [FAVICON EXTRACT] Найден background-size из inline-стилей: ${bgSizeValue}px`);
        }
      }
    }
    
    const favClasses = favEl.className.split(/\s+/).filter(c => c.includes('Favicon') || c.includes('favicon'));
    favClasses.sort((a, b) => b.length - a.length);
    
    // ЭВРИСТИКА 1: Проверяем, есть ли классы типа Favicon-PageX и Favicon-PageX_pos_Y (спрайт)
    // Если есть, ищем базовый класс Favicon-PageX для получения URL спрайта
    // Пропускаем, если уже нашли URL в inline-стилях
    const pageClassMatch = favEl.className.match(/Favicon-Page(\d+)|favicon_page_(\d+)/i);
    const posClassMatch = favEl.className.match(/Favicon-Page\d+_pos_(\d+)/);
    const entryClassMatch = favEl.className.match(/Favicon-Entry(\d+)|favicon_entry_(\d+)/i);
    
    // Если не нашли background-position в inline-стилях, пробуем извлечь из CSS
    if (!bgPosition) {
      // ДИАГНОСТИКА: Проверяем структуру документа
      const headElement = doc.head;
      const bodyElement = doc.body;
      const allStyleTags = doc.querySelectorAll('style');
      const headStyleTags = headElement ? headElement.querySelectorAll('style') : [];
      const bodyStyleTags = bodyElement ? bodyElement.querySelectorAll('style') : [];
      
      console.log(`🔍 [FAVICON EXTRACT] ДИАГНОСТИКА CSS: doc.head=${headElement ? 'есть' : 'нет'}, doc.body=${bodyElement ? 'есть' : 'нет'}`);
      console.log(`   - Всего style тегов в документе: ${allStyleTags.length}`);
      console.log(`   - style тегов в head: ${headStyleTags.length}`);
      console.log(`   - style тегов в body: ${bodyStyleTags.length}`);
      
      // Используем вспомогательную функцию для получения style тегов
      const styleTags = getStyleTags(doc, rawHtml);
      console.log(`   - style тегов через getStyleTags: ${styleTags.length}`);
      
      for (const styleTag of styleTags) {
        const cssText = styleTag.textContent || '';
        
        // Ищем правило для классов элемента с background-position
        for (const favClass of favClasses) {
          const escapedClass = favClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const posRule = new RegExp(`\\.${escapedClass}(?:\\.[^{]*)?\\{[^}]*background-position(?:-y)?[^}]*:([^;}]+)[^}]*\\}`, 'i');
          const posMatch = cssText.match(posRule);
          if (posMatch && posMatch[1]) {
            bgPosition = posMatch[1].trim();
            console.log(`✅ [FAVICON EXTRACT] Найден background-position из CSS для класса "${favClass}": "${bgPosition}"`);
            break;
          }
        }
        if (bgPosition) break;
      }
    }
    
    if (!bgUrl && pageClassMatch) {
      const pageNumber = pageClassMatch[1] || pageClassMatch[2] || '0';
      const pageClassLower = `favicon_page_${pageNumber}`;
      const pageClassUpper = `Favicon-Page${pageNumber}`;
      const escapedPageClassLower = pageClassLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedPageClassUpper = pageClassUpper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Ищем CSS правило для базового класса страницы спрайта
      // Особое внимание: ищем правила вида .favicon_page_0.favicon_entry_1 .favicon__icon
      // или .Favicon-Page0.Favicon-Entry1.Favicon
      const styleTags = getStyleTags(doc, rawHtml);
      for (const styleTag of styleTags) {
        const cssText = styleTag.textContent || '';
        
        // ПРИОРИТЕТ 1: Ищем правило с комбинацией page и entry классов (например, .favicon_page_0.favicon_entry_1)
        // Это правило содержит background-image со списком доменов
        if (entryClassMatch) {
          const entryNumber = entryClassMatch[1] || entryClassMatch[2] || '1';
          const entryClassLower = `favicon_entry_${entryNumber}`;
          const entryClassUpper = `Favicon-Entry${entryNumber}`;
          const escapedEntryClassLower = entryClassLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const escapedEntryClassUpper = entryClassUpper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          // Паттерны для поиска правила с комбинацией классов
          const combinedPatterns = [
            // .favicon_page_0.favicon_entry_1 .favicon__icon или .favicon_page_0.favicon_entry_1
            new RegExp(`\\.${escapedPageClassLower}\\.${escapedEntryClassLower}(?:\\s+\\.[^{]*)?\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*background-size[^}]*:([^;}]+)[^}]*\\}`, 'i'),
            // .Favicon-Page0.Favicon-Entry1.Favicon или .Favicon-Page0.Favicon-Entry1
            new RegExp(`\\.${escapedPageClassUpper}\\.${escapedEntryClassUpper}(?:\\.[^{]*)?\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*background-size[^}]*:([^;}]+)[^}]*\\}`, 'i')
          ];
          
          for (const pattern of combinedPatterns) {
            const match = cssText.match(pattern);
            if (match && match[1]) {
              bgUrl = match[1].replace(/['"]/g, '').trim();
              // Извлекаем background-size (может быть "16px 368px" или "16px")
              const bgSizeStr = match[2] ? match[2].trim() : '';
              // Извлекаем размер одной иконки (первое значение)
              const sizeMatches = bgSizeStr.match(/(\d+(?:\.\d+)?)px/g);
              if (sizeMatches && sizeMatches.length > 0) {
                bgSizeValue = parseFloat(sizeMatches[0]);
                console.log(`✅ [FAVICON EXTRACT] Найден URL спрайта из комбинации классов ${pageClassLower}.${entryClassLower}: ${bgUrl.substring(0, 80)}..., background-size: ${bgSizeStr}, размер иконки: ${bgSizeValue}px`);
              } else {
                console.log(`✅ [FAVICON EXTRACT] Найден URL спрайта из комбинации классов ${pageClassLower}.${entryClassLower}: ${bgUrl.substring(0, 80)}..., background-size: ${bgSizeStr} (не удалось извлечь размер)`);
              }
              break;
            }
          }
        }
        
        // ПРИОРИТЕТ 2: Если не нашли через комбинацию, ищем правило только с page классом
        if (!bgUrl) {
          const basePagePatterns = [
            // Точное совпадение класса
            new RegExp(`\\.${escapedPageClassLower}(?![_\\w-])[^{]*\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*\\}`, 'i'),
            new RegExp(`\\.${escapedPageClassUpper}(?![_\\w-])[^{]*\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*\\}`, 'i'),
            // С классом Favicon перед
            new RegExp(`\\.Favicon\\.${escapedPageClassUpper}(?![_\\w-])[^{]*\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*\\}`, 'i'),
            // С классом Favicon после
            new RegExp(`\\.${escapedPageClassUpper}\\.Favicon[^{]*\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*\\}`, 'i'),
            // С любыми дополнительными классами
            new RegExp(`\\.${escapedPageClassUpper}\\.[^{]*\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*\\}`, 'i')
          ];
          
          let baseMatch: RegExpMatchArray | null = null;
          for (const pattern of basePagePatterns) {
            baseMatch = cssText.match(pattern);
            if (baseMatch && baseMatch[1]) {
              break;
            }
          }
          if (baseMatch && baseMatch[1]) {
            bgUrl = baseMatch[1].replace(/['"]/g, '').trim();
            console.log(`✅ [FAVICON EXTRACT] Найден URL спрайта из класса ${pageClassUpper}: ${bgUrl.substring(0, 80)}...`);
          }
        }
        
        if (bgUrl) {
          // Извлекаем background-position из CSS правила для класса позиции, если есть
          if (posClassMatch) {
            const posClass = `Favicon-Page${posClassMatch[1]}_pos_${posClassMatch[1]}`;
            const escapedPosClass = posClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Ищем правило для класса позиции (разные варианты селекторов)
            const posPatterns = [
              new RegExp(`\\.${escapedPosClass}(?![_\\w-])[^{]*\\{[^}]*background-position[^}]*:([^;}]+)[^}]*\\}`, 'i'),
              new RegExp(`\\.Favicon\\.${escapedPosClass}(?![_\\w-])[^{]*\\{[^}]*background-position[^}]*:([^;}]+)[^}]*\\}`, 'i'),
              new RegExp(`\\.${escapedPosClass}\\.[^{]*\\{[^}]*background-position[^}]*:([^;}]+)[^}]*\\}`, 'i')
            ];
            
            for (const posPattern of posPatterns) {
              const posMatch = cssText.match(posPattern);
              if (posMatch && posMatch[1]) {
                bgPosition = posMatch[1].trim();
                console.log(`✅ [FAVICON EXTRACT] Найдена позиция из класса ${posClass}: ${bgPosition}`);
                break;
              }
            }
          }
          
          break;
        }
      }
    }
    
    // ЭВРИСТИКА 2: Если не нашли через классы спрайта или inline-стили, ищем по всем классам элемента в CSS
    if (!bgUrl) {
      const styleTags = getStyleTags(doc, rawHtml);
      console.log(`🔍 [FAVICON EXTRACT] ЭВРИСТИКА 2: Поиск bgUrl в CSS по классам элемента (найдено ${styleTags.length} style тегов)`);
      
      for (const styleTag of styleTags) {
        const cssText = styleTag.textContent || '';
        
        if (favClasses.length > 0) {
          // Пробуем найти по комбинации всех классов
          const allClassesEscaped = favClasses.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\.');
          const combinedRule = new RegExp(`\\.${allClassesEscaped}[^{]*\\{[^}]*background-image[^}]*url\\(([^)]+)\\)[^}]*\\}`, 'i');
          const combinedMatch = cssText.match(combinedRule);
          if (combinedMatch && combinedMatch[1]) {
            bgUrl = combinedMatch[1].replace(/['"]/g, '').trim();
            console.log(`✅ [FAVICON EXTRACT] Найден bgUrl по комбинации классов: ${bgUrl.substring(0, 80)}...`);
            break;
          }
        }
        
        // Если не нашли по комбинации, пробуем по отдельным классам
        for (const favClass of favClasses) {
          const escapedClass = favClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const cssRule = new RegExp(`\\.${escapedClass}(?:\\.[^{]*)?\\{[^}]*background-image[^}]*url\\(([^)]+)\\)[^}]*\\}`, 'i');
          const match = cssText.match(cssRule);
          if (match && match[1]) {
            bgUrl = match[1].replace(/['"]/g, '').trim();
            console.log(`✅ [FAVICON EXTRACT] Найден bgUrl по классу "${favClass}": ${bgUrl.substring(0, 80)}...`);
            break;
          }
        }
        if (bgUrl) break;
      }
      
      // ДИАГНОСТИКА: Если не нашли, логируем все CSS правила, содержащие favicon или background-image
      if (!bgUrl) {
        console.log(`⚠️ [FAVICON EXTRACT] Не найдено bgUrl по классам элемента. Ищем все упоминания favicon в CSS...`);
        for (const styleTag of styleTags) {
          const cssText = styleTag.textContent || '';
          // Ищем все правила, содержащие favicon
          const faviconRules = cssText.match(/[^{]*\{[^}]*favicon[^}]*\}/gi);
          if (faviconRules && faviconRules.length > 0) {
            console.log(`🔍 [FAVICON EXTRACT] Найдено ${faviconRules.length} CSS правил с упоминанием favicon:`);
            faviconRules.slice(0, 5).forEach((rule, idx) => {
              console.log(`   ${idx + 1}. ${rule.substring(0, 200)}...`);
            });
          }
          
          // Ищем все правила с background-image и favicon.yandex.net
          const spriteRules = cssText.match(/[^{]*\{[^}]*favicon\.yandex\.net[^}]*\}/gi);
          if (spriteRules && spriteRules.length > 0) {
            console.log(`🔍 [FAVICON EXTRACT] Найдено ${spriteRules.length} CSS правил со спрайтом favicon.yandex.net:`);
            spriteRules.slice(0, 5).forEach((rule, idx) => {
              console.log(`   ${idx + 1}. ${rule.substring(0, 200)}...`);
            });
          }
        }
      }
    }
    
    // ЭВРИСТИКА 3: Если есть класс позиции, но не нашли position в CSS, 
    // вычисляем position из номера позиции в классе и background-size
    if (bgUrl && posClassMatch && !bgPosition) {
      const posNumber = parseInt(posClassMatch[1], 10);
      // Пробуем получить background-size из inline стилей или CSS для вычисления смещения
      const styleAttr = favEl.getAttribute('style') || '';
      const bgSizeMatch = styleAttr.match(/background-size\s*:\s*([^;]+)/i);
      let bgSize: string | null = bgSizeMatch ? bgSizeMatch[1].trim() : null;
      
      // Если не нашли в inline, ищем в CSS
      if (!bgSize && pageClassMatch) {
        const pageNumber = pageClassMatch[1] || pageClassMatch[2] || '0';
        const pageClass = `Favicon-Page${pageNumber}`;
        const escapedPageClass = pageClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const styleTags = getStyleTags(doc, rawHtml);
        for (const styleTag of styleTags) {
          const cssText = styleTag.textContent || '';
          const sizeRule = new RegExp(`\\.(?:Favicon\\.)?${escapedPageClass}(?![_\\w])[^{]*\\{[^}]*background-size[^}]*:([^;}]+)[^}]*\\}`, 'i');
          const sizeMatch = cssText.match(sizeRule);
          if (sizeMatch && sizeMatch[1]) {
            bgSize = sizeMatch[1].trim();
            break;
          }
        }
      }
      
      if (bgSize) {
        const sizeMatch = bgSize.match(/(\d+(?:\.\d+)?)px/i);
        if (sizeMatch) {
          const size = parseFloat(sizeMatch[1]);
          // Вычисляем смещение: позиция * размер (вертикальный спрайт)
          bgPosition = `0px ${-posNumber * size}px`;
        }
      }
    }
    
    // ЭВРИСТИКА 4: Если bgUrl все еще пустой, но есть background-position, 
    // ищем спрайт в CSS по любому правилу, содержащему favicon.yandex.net
    if (!bgUrl && bgPosition) {
      console.log(`🔍 [FAVICON EXTRACT] ЭВРИСТИКА 4: bgUrl пустой, но есть bgPosition="${bgPosition}", ищем спрайт в CSS...`);
      const styleTags = getStyleTags(doc, rawHtml);
      let spriteUrl: string | null = null;
      let bgSizeValue: number | null = null;
      
      for (const styleTag of styleTags) {
        const cssText = styleTag.textContent || '';
        
        // Ищем любое правило с background-image, содержащее favicon.yandex.net/favicon/v2/
        // Более гибкий паттерн: ищем URL со списком доменов
        const spriteUrlPatterns = [
          // Паттерн 1: background-image: url(...favicon.yandex.net/favicon/v2/...)
          /background-image[^}]*url\s*\(\s*["']?([^"')]*favicon\.yandex\.net\/favicon\/v2\/[^"')]+)["']?\s*\)/gi,
          // Паттерн 2: url(...favicon.yandex.net/favicon/v2/...) в любом месте правила
          /url\s*\(\s*["']?([^"')]*favicon\.yandex\.net\/favicon\/v2\/[^"')]+)["']?\s*\)/gi
        ];
        
        for (const pattern of spriteUrlPatterns) {
          const matches = cssText.matchAll(pattern);
          for (const match of matches) {
            if (match[1]) {
              spriteUrl = match[1].trim();
              console.log(`✅ [FAVICON EXTRACT] Найден спрайт URL в CSS: ${spriteUrl.substring(0, 100)}...`);
              
              // Пробуем найти background-size в том же правиле или рядом
              // Ищем правило, содержащее этот URL
              const ruleMatch = cssText.match(new RegExp(`[^{]*\\{[^}]*${spriteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^}]*background-size[^}]*:([^;}]+)[^}]*\\}`, 'i'));
              if (ruleMatch && ruleMatch[1]) {
                const sizeValueMatch = ruleMatch[1].match(/(\d+(?:\.\d+)?)px/i);
                if (sizeValueMatch) {
                  bgSizeValue = parseFloat(sizeValueMatch[1]);
                  console.log(`✅ [FAVICON EXTRACT] Найден background-size: ${bgSizeValue}px`);
                }
              }
              
              // Если не нашли в том же правиле, ищем в соседних правилах (может быть разделено на несколько правил)
              if (!bgSizeValue) {
                const sizeMatch = cssText.match(/background-size[^}]*:\s*([^;}]+)/gi);
                if (sizeMatch && sizeMatch.length > 0) {
                  // Берем первое найденное значение background-size
                  const firstSizeMatch = sizeMatch[0].match(/(\d+(?:\.\d+)?)px/i);
                  if (firstSizeMatch) {
                    bgSizeValue = parseFloat(firstSizeMatch[1]);
                    console.log(`✅ [FAVICON EXTRACT] Найден background-size из соседнего правила: ${bgSizeValue}px`);
                  }
                }
              }
              
              break;
            }
          }
          if (spriteUrl) break;
        }
        if (spriteUrl) break;
      }
      
      // ЭВРИСТИКА 4.5: Если не нашли в CSS, ищем в сыром HTML (включая <link> теги и другие места)
      if (!spriteUrl && rawHtml) {
        console.log(`🔍 [FAVICON EXTRACT] ЭВРИСТИКА 4.5: Не найдено в CSS, ищем спрайт в сыром HTML...`);
        
        // Ищем паттерны favicon.yandex.net/favicon/v2/ в сыром HTML
        // Это может быть в <link> тегах, в data-атрибутах, в JavaScript, в комментариях и т.д.
        const rawHtmlSpritePatterns = [
          // Паттерн 1: в href атрибутах <link> тегов
          /href\s*=\s*["']([^"']*favicon\.yandex\.net\/favicon\/v2\/[^"']+)["']/gi,
          // Паттерн 2: в url() функциях в любом месте
          /url\s*\(\s*["']?([^"')]*favicon\.yandex\.net\/favicon\/v2\/[^"')]+)["']?\s*\)/gi,
          // Паттерн 3: просто URL в кавычках или без
          /["']([^"']*favicon\.yandex\.net\/favicon\/v2\/[^"']+)["']/gi,
          // Паттерн 4: URL без кавычек (более рискованный, но может помочь)
          /(https?:\/\/[^\s"'>]*favicon\.yandex\.net\/favicon\/v2\/[^\s"'>]+)/gi
        ];
        
        for (const pattern of rawHtmlSpritePatterns) {
          const matches = rawHtml.matchAll(pattern);
          for (const match of matches) {
            if (match[1] && match[1].includes('favicon.yandex.net/favicon/v2/')) {
              spriteUrl = match[1].trim();
              // Очищаем URL от возможных лишних символов
              spriteUrl = spriteUrl.replace(/['"]/g, '').split('?')[0]; // Убираем кавычки и параметры для проверки
              // Восстанавливаем полный URL с параметрами, если они были
              const fullMatch = match[0];
              if (fullMatch.includes('?')) {
                const paramMatch = fullMatch.match(/\?[^"')]+/);
                if (paramMatch) {
                  spriteUrl = spriteUrl + paramMatch[0];
                }
              }
              console.log(`✅ [FAVICON EXTRACT] Найден спрайт URL в сыром HTML: ${spriteUrl.substring(0, 100)}...`);
              
              // Пробуем найти background-size в inline-стилях элемента
              if (!bgSizeValue) {
                const styleAttr = favEl.getAttribute('style') || '';
                const bgSizeMatch = styleAttr.match(/background-size\s*:\s*([^;]+)/i);
                if (bgSizeMatch && bgSizeMatch[1]) {
                  const bgSizeStr = bgSizeMatch[1].trim();
                  const sizeValueMatches = bgSizeStr.match(/(\d+(?:\.\d+)?)px/g);
                  if (sizeValueMatches && sizeValueMatches.length > 0) {
                    bgSizeValue = parseFloat(sizeValueMatches[0]);
                    console.log(`✅ [FAVICON EXTRACT] Найден background-size из inline-стилей: ${bgSizeValue}px`);
                  }
                }
              }
              
              break;
            }
          }
          if (spriteUrl) break;
        }
      }
      
      // Если нашли спрайт, обрабатываем его
      if (spriteUrl && spriteUrl.includes('favicon.yandex.net/favicon/v2/')) {
        bgUrl = spriteUrl; // Устанавливаем bgUrl для дальнейшей обработки
        console.log(`✅ [FAVICON EXTRACT] Установлен bgUrl из спрайта: ${bgUrl.substring(0, 100)}...`);
      }
    }
    
    // Если не нашли в CSS, проверяем img src (как fallback)
    if (!bgUrl) {
      const imgEl = favEl.querySelector('img') as HTMLImageElement | null;
      if (imgEl && imgEl.src) {
        bgUrl = imgEl.src;
        console.log(`✅ [FAVICON EXTRACT] Найден bgUrl из img src: ${bgUrl.substring(0, 80)}...`);
      }
    }
    
    if (!bgUrl || bgUrl.trim().length === 0) {
      console.log(`⚠️ [FAVICON EXTRACT] bgUrl пустой после всех попыток извлечения`);
      console.log(`   🔍 Диагностика: favClasses=[${favClasses.join(', ')}], bgPosition="${bgPosition || '(нет)'}", pageClassMatch=${pageClassMatch ? 'да' : 'нет'}, entryClassMatch=${entryClassMatch ? 'да' : 'нет'}`);
      
      // Если есть активный спрайт, используем следующую иконку из него
      if (spriteState && spriteState.currentIndex < spriteState.urls.length) {
        row['#FaviconImage'] = spriteState.urls[spriteState.currentIndex];
        console.log(`✅ [FAVICON EXTRACT] Использована фавиконка из спрайта (fallback 1): ${row['#FaviconImage']}`);
        spriteState.currentIndex++;
        return spriteState;
      }
      console.log(`⚠️ [FAVICON EXTRACT] Нет активного спрайта, row['#FaviconImage'] остается пустым (fallback 1)`);
      return spriteState;
    }
    
    bgUrl = bgUrl.trim().replace(/\s+/g, '');
    console.log(`🔍 [FAVICON EXTRACT] bgUrl после очистки: "${bgUrl.substring(0, 100)}..."`);
    
    if (bgUrl.startsWith('//')) {
      bgUrl = 'https:' + bgUrl;
      console.log(`🔍 [FAVICON EXTRACT] bgUrl после добавления протокола: "${bgUrl.substring(0, 100)}..."`);
    }

    // НОВАЯ ЛОГИКА: Обработка спрайт-списков в URL (если есть точка с запятой)
    if (bgUrl.includes('favicon.yandex.net/favicon/v2/') && bgUrl.includes(';')) {
      console.log(`🔍 [FAVICON EXTRACT] Обнаружен URL со списком доменов (спрайт): ${bgUrl}`);
      
      // Извлекаем часть с доменами: все после /v2/ и до ? или конца строки
      const v2Match = bgUrl.match(/favicon\.yandex\.net\/favicon\/v2\/(.+?)(\?|$)/);
      if (v2Match && v2Match[1]) {
        const domainsPart = v2Match[1];
        const domains = domainsPart.split(';').filter(d => d.trim().length > 0);
        console.log(`🔍 [FAVICON EXTRACT] Доменов в списке: ${domains.length}`);
        
        let index = 0;
        if (bgPosition) {
          // Извлекаем смещение по Y (обычно отрицательное значение в px)
          // Ищем число перед 'px', возможно с минусом
          const yMatch = bgPosition.match(/(?:^|\s)(-?\d+(?:\.\d+)?)px/);
          if (yMatch) {
            const yOffset = Math.abs(parseFloat(yMatch[1]));
            
            // ЭВРИСТИКА: Шаг спрайта (высота иконки + отступ).
            // Пользователь указал, что шаг равен 20px (0, -20, -40, -60...)
            const stride = 20; 
            
            index = Math.round(yOffset / stride);
            console.log(`🔍 [FAVICON EXTRACT] Расчет индекса из background-position: offset=${yOffset}px, stride=${stride}px => index=${index}`);
          }
        }
        
        if (index >= 0 && index < domains.length) {
          const domain = domains[index];
          // Формируем чистый URL для конкретного домена
          bgUrl = `https://favicon.yandex.net/favicon/v2/${domain}?size=32`;
          console.log(`✅ [FAVICON EXTRACT] Извлечен домен ${domain} (индекс ${index}) из спрайта. Новый URL: ${bgUrl}`);
        } else {
          console.warn(`⚠️ [FAVICON EXTRACT] Индекс ${index} вне границ массива доменов (${domains.length}). Используем первый домен.`);
          if (domains.length > 0) {
            bgUrl = `https://favicon.yandex.net/favicon/v2/${domains[0]}?size=32`;
          }
        }
      }
    }
    
    if (!bgUrl.startsWith('http://') && !bgUrl.startsWith('https://')) {
      console.log(`⚠️ [FAVICON EXTRACT] bgUrl имеет невалидный формат: "${bgUrl.substring(0, 100)}..."`);
      // Если есть активный спрайт, используем следующую иконку из него
      if (spriteState && spriteState.currentIndex < spriteState.urls.length) {
        row['#FaviconImage'] = spriteState.urls[spriteState.currentIndex];
        console.log(`✅ [FAVICON EXTRACT] Использована фавиконка из спрайта (fallback 2): ${row['#FaviconImage']}`);
        spriteState.currentIndex++;
        return spriteState;
      }
      console.log(`⚠️ [FAVICON EXTRACT] Нет активного спрайта, row['#FaviconImage'] остается пустым (fallback 2)`);
      return spriteState;
    }
    
    // НОВАЯ ЛОГИКА: Если есть background-position, но нет bgUrl (или bgUrl содержит спрайт),
    // ищем в CSS правила со спрайтом и сопоставляем позицию с доменами
    if (bgPosition && (!bgUrl || bgUrl.includes('favicon.yandex.net/favicon/v2/'))) {
      console.log(`🔍 [FAVICON EXTRACT] Пытаемся сопоставить background-position "${bgPosition}" с доменами в спрайте`);
      
      // Используем уже найденный bgUrl, если он содержит спрайт
      let spriteUrl: string | null = bgUrl && bgUrl.includes('favicon.yandex.net/favicon/v2/') ? bgUrl : null;
      // Используем уже найденный bgSizeValue, если он был извлечен ранее
      let spriteBgSizeValue: number | null = bgSizeValue;
      
      // Если bgUrl уже найден и содержит спрайт, используем его
      if (spriteUrl) {
        console.log(`✅ [FAVICON EXTRACT] Используем уже найденный bgUrl как спрайт: ${spriteUrl.substring(0, 100)}..., bgSizeValue: ${spriteBgSizeValue || 'не найден'}px`);
      } else {
        // Ищем в CSS базовое правило со спрайтом (которое содержит список доменов)
        const styleTags = getStyleTags(doc, rawHtml);
        
        for (const styleTag of styleTags) {
          const cssText = styleTag.textContent || '';
          
          // Ищем правило со спрайтом (формат: .favicon_page_0.favicon_entry_1 или .Favicon-Page0.Favicon-Entry1)
          // которое содержит background-image с списком доменов
          // Улучшенный паттерн: учитывает дополнительные классы в селекторе (например, .favicon_page_0.favicon_entry_1 .favicon__icon)
          const spriteRulePatterns = [
            // .favicon_page_0.favicon_entry_1 .favicon__icon или .favicon_page_0.favicon_entry_1
            /\.favicon_page_\d+\.favicon_entry_\d+(?:\s+\.[^{]*)?\{[^}]*background-image[^}]*url\s*\(\s*["']?([^"')]+)["']?\s*\)[^}]*background-size[^}]*:([^;}]+)[^}]*\}/i,
            // .Favicon-Page0.Favicon-Entry1.Favicon или .Favicon-Page0.Favicon-Entry1
            /\.Favicon-Page\d+\.Favicon-Entry\d+(?:\.[^{]*)?\{[^}]*background-image[^}]*url\s*\(\s*["']?([^"')]+)["']?\s*\)[^}]*background-size[^}]*:([^;}]+)[^}]*\}/i
          ];
          
          for (const pattern of spriteRulePatterns) {
            const spriteRuleMatch = cssText.match(pattern);
            if (spriteRuleMatch && spriteRuleMatch[1]) {
              spriteUrl = spriteRuleMatch[1].trim();
              // Извлекаем background-size (может быть "16px 368px" или "16px")
              // Для спрайта важна высота одной иконки (первое значение, если два значения)
              const bgSizeStr = spriteRuleMatch[2] ? spriteRuleMatch[2].trim() : '';
              const sizeMatches = bgSizeStr.match(/(\d+(?:\.\d+)?)px/g);
              if (sizeMatches && sizeMatches.length > 0) {
                // Если два значения (например, "16px 368px"), берем первое (высота одной иконки)
                // Если одно значение, используем его
                spriteBgSizeValue = parseFloat(sizeMatches[0]);
                console.log(`✅ [FAVICON EXTRACT] Найдено правило со спрайтом: ${spriteUrl.substring(0, 100)}..., background-size: ${bgSizeStr}, размер иконки: ${spriteBgSizeValue}px`);
              } else {
                console.log(`✅ [FAVICON EXTRACT] Найдено правило со спрайтом: ${spriteUrl.substring(0, 100)}..., background-size: ${bgSizeStr} (не удалось извлечь размер)`);
              }
              break;
            }
          }
          
          if (spriteUrl) break;
        }
        
        // Если не нашли через favicon_entry, пробуем найти через другие паттерны
        if (!spriteUrl) {
          for (const styleTag of styleTags) {
            const cssText = styleTag.textContent || '';
            // Ищем любое правило с background-image, содержащее favicon.yandex.net/favicon/v2/ и список доменов
            const spriteUrlMatch = cssText.match(/background-image[^}]*url\s*\(\s*["']?([^"')]*favicon\.yandex\.net\/favicon\/v2\/[^"')]+)["']?\s*\)/i);
            if (spriteUrlMatch && spriteUrlMatch[1]) {
              spriteUrl = spriteUrlMatch[1].trim();
              // Пробуем найти background-size в том же правиле или в связанном правиле
              const fullRuleMatch = cssText.match(/[^{]*\{[^}]*background-image[^}]*url\s*\(\s*["']?[^"')]*favicon\.yandex\.net\/favicon\/v2\/[^"')]+["']?\s*\)[^}]*background-size[^}]*:([^;}]+)[^}]*\}/i);
              if (fullRuleMatch && fullRuleMatch[1]) {
                const bgSizeStr = fullRuleMatch[1].trim();
                const sizeValueMatches = bgSizeStr.match(/(\d+(?:\.\d+)?)px/g);
                if (sizeValueMatches && sizeValueMatches.length > 0) {
                  spriteBgSizeValue = parseFloat(sizeValueMatches[0]);
                }
              }
              console.log(`✅ [FAVICON EXTRACT] Найдено правило со спрайтом (альтернативный паттерн): ${spriteUrl.substring(0, 100)}..., размер: ${spriteBgSizeValue || 'не найден'}px`);
              break;
            }
          }
        }
        
        // Если все еще не нашли в CSS, ищем в сыром HTML
        if (!spriteUrl && rawHtml) {
          console.log(`🔍 [FAVICON EXTRACT] Не найдено в CSS, ищем спрайт в сыром HTML (в логике обработки спрайта)...`);
          
          const rawHtmlSpritePatterns = [
            /href\s*=\s*["']([^"']*favicon\.yandex\.net\/favicon\/v2\/[^"']+)["']/gi,
            /url\s*\(\s*["']?([^"')]*favicon\.yandex\.net\/favicon\/v2\/[^"')]+)["']?\s*\)/gi,
            /["']([^"']*favicon\.yandex\.net\/favicon\/v2\/[^"']+)["']/gi,
            /(https?:\/\/[^\s"'>]*favicon\.yandex\.net\/favicon\/v2\/[^\s"'>]+)/gi
          ];
          
          for (const pattern of rawHtmlSpritePatterns) {
            const matches = rawHtml.matchAll(pattern);
            for (const match of matches) {
              if (match[1] && match[1].includes('favicon.yandex.net/favicon/v2/')) {
                spriteUrl = match[1].trim();
                // Очищаем URL от возможных лишних символов
                spriteUrl = spriteUrl.replace(/['"]/g, '').split('?')[0];
                // Восстанавливаем полный URL с параметрами, если они были
                const fullMatch = match[0];
                if (fullMatch.includes('?')) {
                  const paramMatch = fullMatch.match(/\?[^"')]+/);
                  if (paramMatch) {
                    spriteUrl = spriteUrl + paramMatch[0];
                  }
                }
                console.log(`✅ [FAVICON EXTRACT] Найден спрайт URL в сыром HTML (в логике обработки спрайта): ${spriteUrl.substring(0, 100)}...`);
                
                // Используем bgSizeValue из inline-стилей, если он был найден ранее
                if (!spriteBgSizeValue && bgSizeValue) {
                  spriteBgSizeValue = bgSizeValue;
                  console.log(`✅ [FAVICON EXTRACT] Используем bgSizeValue из inline-стилей: ${spriteBgSizeValue}px`);
                }
                
                break;
              }
            }
            if (spriteUrl) break;
          }
        }
      }
      
      // Если bgUrl уже найден, но bgSizeValue не найден, пробуем найти его в CSS
      if (spriteUrl && !spriteBgSizeValue) {
        const styleTags = getStyleTags(doc, rawHtml);
        for (const styleTag of styleTags) {
          const cssText = styleTag.textContent || '';
          // Ищем background-size в правилах, связанных с favicon классами
          for (const favClass of favClasses) {
            const escapedClass = favClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const sizeRule = new RegExp(`\\.${escapedClass}(?:\\.[^{]*)?\\{[^}]*background-size[^}]*:([^;}]+)[^}]*\\}`, 'i');
            const sizeMatch = cssText.match(sizeRule);
            if (sizeMatch && sizeMatch[1]) {
              const bgSizeStr = sizeMatch[1].trim();
              // Извлекаем размер (может быть "16px 368px" или "16px")
              const sizeValueMatches = bgSizeStr.match(/(\d+(?:\.\d+)?)px/g);
              if (sizeValueMatches && sizeValueMatches.length > 0) {
                // Берем первое значение (высота одной иконки)
                spriteBgSizeValue = parseFloat(sizeValueMatches[0]);
                console.log(`✅ [FAVICON EXTRACT] Найден background-size из CSS для класса "${favClass}": ${bgSizeStr}, размер иконки: ${spriteBgSizeValue}px`);
                break;
              }
            }
          }
          if (spriteBgSizeValue) break;
        }
      }
      
      if (spriteUrl && spriteUrl.includes('favicon.yandex.net/favicon/v2/')) {
        // Извлекаем список доменов из URL спрайта
        const spriteListMatch = spriteUrl.match(/favicon\.yandex\.net\/favicon\/v2\/(.+)/i);
        if (spriteListMatch && spriteListMatch[1]) {
          let addressesString = spriteListMatch[1];
          // Убираем параметры запроса
          addressesString = addressesString.split('?')[0];
          // Разделяем по точке с запятой
          const addresses = addressesString.split(';').filter(addr => addr.trim().length > 0);
          
          console.log(`🔍 [FAVICON EXTRACT] Извлечено ${addresses.length} доменов из спрайта`);
          
          let positionIndex: number | null = null;
          
          // ПРИОРИТЕТ 1: Если есть номер входа из класса (Favicon-EntryN), используем его как индекс
          if (entryClassMatch) {
            const entryNumber = parseInt(entryClassMatch[1] || entryClassMatch[2] || '0', 10);
            // Номера входа обычно начинаются с 1, но индексы массивов с 0
            positionIndex = entryNumber > 0 ? entryNumber - 1 : 0;
            console.log(`🔍 [FAVICON EXTRACT] Используем номер входа из класса: ${entryNumber} -> индекс ${positionIndex}`);
          }
          
          // ПРИОРИТЕТ 2: Если нет номера входа, вычисляем индекс по background-position и размеру
          if (positionIndex === null && spriteBgSizeValue && bgPosition) {
            // background-position может быть в формате "0px -16px" (x y) или просто "-16px"
            // Для вертикального спрайта важна вторая координата (y)
            const posMatches = bgPosition.match(/-?\d+(?:\.\d+)?px/g);
            if (posMatches && posMatches.length > 0) {
              // Если две координаты, берем вторую (y), иначе первую
              const posValueStr = posMatches.length > 1 ? posMatches[1] : posMatches[0];
              const posValue = Math.abs(parseFloat(posValueStr));
              // Определяем индекс позиции: позиция / размер (например, 16px / 16px = 1, означает вторую иконку)
              // Индекс начинается с 0, поэтому если позиция -16px, это индекс 1
              positionIndex = Math.floor(posValue / spriteBgSizeValue);
              console.log(`🔍 [FAVICON EXTRACT] Вычислен индекс позиции: ${positionIndex} (${posValue}px / ${spriteBgSizeValue}px, из bgPosition="${bgPosition}")`);
            }
          }
          
          if (positionIndex !== null && positionIndex >= 0 && positionIndex < addresses.length) {
            const host = addresses[positionIndex].trim();
            // Очищаем хост от протокола и параметров
            let cleanHost = host.replace(/^https?:\/\//i, '').split('?')[0].split('/')[0];
            // Если хост начинается с https://, оставляем его полностью
            if (host.startsWith('https://') || host.startsWith('http://')) {
              cleanHost = host.split('?')[0];
            }
            
            // Генерируем URL фавиконки по шаблону
            const faviconUrl = `https://favicon.yandex.net/favicon/v2/${encodeURIComponent(cleanHost)}?size=32&stub=1`;
            
            // Если URL уже был сформирован как SPRITE_LIST, просто обновляем его
            if (row['#FaviconImage'] && row['#FaviconImage'].startsWith('SPRITE_LIST:')) {
              console.log(`✅ [FAVICON EXTRACT] Обновляем SPRITE_LIST на конкретный URL для хоста "${cleanHost}": ${faviconUrl}`);
            }
            
            row['#FaviconImage'] = faviconUrl;
            console.log(`✅ [FAVICON EXTRACT] Сопоставлен домен "${cleanHost}" (индекс ${positionIndex}), URL: ${faviconUrl}`);
            
            // Возвращаем null, чтобы сбросить состояние спрайта, так как мы нашли конкретную иконку
            return null; 
          } else if (addresses.length > 0) {
            console.log(`⚠️ [FAVICON EXTRACT] Не удалось определить индекс позиции (${positionIndex}), используем первый домен`);
            const host = addresses[0].trim();
            let cleanHost = host.replace(/^https?:\/\//i, '').split('?')[0].split('/')[0];
            if (host.startsWith('https://') || host.startsWith('http://')) {
              cleanHost = host.split('?')[0];
            }
            const faviconUrl = `https://favicon.yandex.net/favicon/v2/${encodeURIComponent(cleanHost)}?size=32&stub=1`;
            row['#FaviconImage'] = faviconUrl;
            console.log(`✅ [FAVICON EXTRACT] Использован первый домен "${cleanHost}", URL: ${faviconUrl}`);
            return null;
          }
        }
      }
    }
    
    // Проверяем, является ли это спрайтом с перечислением адресов
    // Формат: //favicon.yandex.net/favicon/v2/https://site1;https://site2;...;https://siteN?size=32&stub=1&reqid=...
    // Извлекаем список доменов: берем все после /favicon/v2/
    const spriteListMatch = bgUrl && bgUrl.match(/favicon\.yandex\.net\/favicon\/v2\/(.+)/i);
    if (spriteListMatch && spriteListMatch[1]) {
      let addressesString = spriteListMatch[1];
      
      // Сначала убираем глобальные параметры запроса (все что после ?)
      addressesString = addressesString.split('?')[0];
      
      // Разделяем по точке с запятой
      const addresses = addressesString.split(';').filter(addr => addr.trim().length > 0);
      
      if (addresses.length > 0) {
        // Если мы здесь, значит не сработала логика с background-position выше
        // (например, позиция не найдена или равна 0)
        
        // Пробуем найти позицию еще раз, если она есть
        if (bgPosition) {
           // Повторяем попытку извлечения индекса (дублирование логики для надежности)
           const posMatches = bgPosition.match(/-?\d+(?:\.\d+)?px/g);
           if (posMatches && posMatches.length > 0) {
              const posValueStr = posMatches.length > 1 ? posMatches[1] : posMatches[0];
              const posValue = Math.abs(parseFloat(posValueStr));
              
              // Пытаемся найти spriteBgSizeValue из контекста или используем фоллбэк
              let itemSize = 20; // Default fallback
              if (bgSizeValue) {
                itemSize = bgSizeValue;
              }
              
              const calculatedIndex = Math.floor(posValue / itemSize);
              
              if (calculatedIndex >= 0 && calculatedIndex < addresses.length) {
                 const host = addresses[calculatedIndex].trim();
                 let cleanHost = host.replace(/^https?:\/\//i, '').split('?')[0].split('/')[0];
                 if (host.startsWith('https://') || host.startsWith('http://')) {
                    cleanHost = host.split('?')[0];
                 }
                 const faviconUrl = `https://favicon.yandex.net/favicon/v2/${encodeURIComponent(cleanHost)}?size=32&stub=1`;
                 row['#FaviconImage'] = faviconUrl;
                 console.log(`✅ [FAVICON EXTRACT] (Fallback) Сопоставлен домен "${cleanHost}" (индекс ${calculatedIndex}) из списка, URL: ${faviconUrl}`);
                 
                 // Инициализируем спрайт для БУДУЩИХ строк, но текущую мы уже заполнили
                 const faviconUrls = addresses.map(addr => {
                    const cleanAddr = addr.trim();
                    const cleanAddrWithoutParams = cleanAddr.split('?')[0];
                    return `https://favicon.yandex.net/favicon/v2/${encodeURIComponent(cleanAddrWithoutParams)}?size=32&stub=1`;
                 });
                 
                 return {
                   urls: faviconUrls,
                   currentIndex: calculatedIndex + 1 // Следующий индекс
                 };
              }
           }
        }

        // Если не удалось определить конкретную позицию, берем первую
        const faviconUrls = addresses.map(addr => {
          const cleanAddr = addr.trim();
          const cleanAddrWithoutParams = cleanAddr.split('?')[0];
          return `https://favicon.yandex.net/favicon/v2/${encodeURIComponent(cleanAddrWithoutParams)}?size=32&stub=1`;
        });
        
        // Для текущей строки используем ПЕРВУЮ иконку, а не список
        // Это предотвращает ошибку "Unsupported image type" при попытке загрузить "SPRITE_LIST:..." как URL
        const firstFaviconUrl = faviconUrls[0];
        row['#FaviconImage'] = firstFaviconUrl;
        console.log(`✅ [FAVICON EXTRACT] Установлена первая иконка из списка: ${firstFaviconUrl.substring(0, 100)}...`);
        
        // Создаем новое состояние спрайта для следующих строк
        const newSpriteState = {
          urls: faviconUrls,
          currentIndex: 1 // Следующий индекс (первая иконка уже использована)
        };
        
        console.log(`✅ Спрайт-список инициализирован: ${addresses.length} адресов`);
        
        return newSpriteState;
      }
    }
    
    // Если это обычный URL (не спрайт), используем его напрямую
    // Если есть активный спрайт, сбрасываем его (встретился другой тип фавиконки)
    row['#FaviconImage'] = bgUrl;
    console.log(`✅ [FAVICON EXTRACT] Установлен обычный URL: ${row['#FaviconImage'].substring(0, 100)}...`);
    return null; // Сбрасываем состояние спрайта
  } catch (e) {
    console.error('❌ [FAVICON EXTRACT] Ошибка парсинга фавиконки:', e);
    return spriteState; // Возвращаем состояние без изменений при ошибке
  }
}

// Compiled regex patterns для оптимизации (компилируем заранее)
const PRICE_DIGITS_REGEX = /[^0-9]/g;
const CURRENCY_RUB_REGEX = /₽|руб/i;
const CURRENCY_USD_REGEX = /\$/i;
const CURRENCY_EUR_REGEX = /€/;
const DISCOUNT_PERCENT_REGEX = /([\d,]+)\s*%/;
const RATING_REGEX = /([\d,]+)/;
const REVIEWS_REGEX = /([\d\s,]+)\s*К?\s*(?:отзыв|review)/i;

// Извлекает цены из контейнера
function extractPrices(container: Element): { price: string; currency: string; oldPrice?: string } {
  const priceElements = container.querySelectorAll('.EProductSnippet2-Price, [class*="EProductSnippet2-Price"], .Price, [class*="Price"], [class*="price"]');
  const prices: { value: number; currency: string; text: string }[] = [];
  
  for (const priceEl of priceElements) {
    const text = priceEl.textContent?.trim() || '';
    const digits = text.replace(PRICE_DIGITS_REGEX, '');
    if (digits.length >= 3) {
      const value = parseInt(digits, 10);
      const currency = CURRENCY_RUB_REGEX.test(text) ? '₽' : (CURRENCY_USD_REGEX.test(text) ? '$' : (CURRENCY_EUR_REGEX.test(text) ? '€' : ''));
      prices.push({ value, currency, text });
    }
  }
  
  if (prices.length > 0) {
    const sortedPrices = prices.sort((a, b) => a.value - b.value);
    const currentPrice = sortedPrices[0];
    const result: { price: string; currency: string; oldPrice?: string } = {
      price: currentPrice.value.toString(),
      currency: currentPrice.currency === 'руб.' ? '₽' : currentPrice.currency
    };
    
    if (sortedPrices.length > 1 && sortedPrices[1].value > currentPrice.value * 1.1) {
      result.oldPrice = sortedPrices[1].value.toString();
    }
    
    return result;
  }
  
  return { price: '', currency: '' };
}

// Извлекает все данные строки из контейнера
// spriteState - состояние текущего спрайта
// Возвращает { row: CSVRow | null, spriteState: состояние спрайта }
function extractRowData(
  container: Element, 
  doc: Document,
  spriteState: { urls: string[]; currentIndex: number } | null,
  rawHtml?: string
): { row: CSVRow | null; spriteState: { urls: string[]; currentIndex: number } | null } {
  // Пропускаем рекламные сниппеты
  if (isInsideAdvProductGallery(container)) {
    console.log('⚠️ Пропущен рекламный сниппет из AdvProductGallery');
    return { row: null, spriteState: spriteState };
  }
  
  const row: CSVRow = {
    '#SnippetType': container.className.includes('EProductSnippet2') ? 'EProductSnippet2' : 
                    container.className.includes('EShopItem') ? 'EShopItem' : 
                    'Organic_withOfferInfo',
    '#ProductURL': '',
    '#OrganicTitle': '',
    '#ShopName': '',
    '#OrganicHost': '',
    '#OrganicPath': '',
    '#SnippetFavicon': '',
    '#FaviconImage': '',
    '#OrganicText': '',
    '#OrganicImage': '',
    '#ThumbImage': '',
    '#OrganicPrice': '',
    '#Currency': '',
    '#PriceInfo': '',
    '#OldPrice': '',
    '#DiscountPercent': '',
    '#ShopRating': '',
    '#ReviewsNumber': '',
    '#ProductRating': '',
    '#LabelsList': '',
    '#DeliveryList': '',
    '#FintechList': '',
    '#QuoteImage': '',
    '#QuoteText': '',
    '#Availability': '',
    '#PickupOptions': '',
    '#DeliveryETA': ''
  };
  
  // #ProductURL
  const productURL = extractProductURL(container);
  if (productURL) {
    row['#ProductURL'] = productURL;
    try {
      const u = new URL(productURL);
      row['#OrganicHost'] = u.hostname;
    } catch (e) {
      // ignore
    }
  }
  
  // #OrganicTitle
  let titleEl: Element | null = container.querySelector('.OrganicTitle, [class*="OrganicTitle"], .EProductSnippet2-Title, [class*="EProductSnippet2-Title"]');
  if (!titleEl) {
    titleEl = container.querySelector('.EProductSnippet2-Title a, [class*="EProductSnippet2-Title"] a');
  }
  if (titleEl) {
    row['#OrganicTitle'] = getTextContent(titleEl);
  }
  
  // #ShopName
  if (row['#SnippetType'] === 'EProductSnippet2') {
    const shopName = container.querySelector('.EShopName');
    if (shopName) {
      row['#ShopName'] = getTextContent(shopName);
    }
  }
  
  if (row['#SnippetType'] === 'EProductSnippet2' && !row['#ShopName']) {
    const shopNameAlt = container.querySelector('.EShopName, [class*="EShopName"], [class*="ShopName"]');
    if (shopNameAlt) {
      row['#ShopName'] = getTextContent(shopNameAlt);
    } else if (row['#OrganicHost']) {
      row['#ShopName'] = row['#OrganicHost'];
    }
  }
  
  // #OrganicPath
  const path = container.querySelector('.Path, [class*="Path"]');
  if (path) {
    const fixedPathText = getTextContent(path);
    const firstSeparator = fixedPathText.indexOf('›');
    row['#OrganicPath'] = firstSeparator > 0 ? fixedPathText.substring(firstSeparator + 1).trim() : fixedPathText;
  }
  
  // #FaviconImage
  spriteState = extractFavicon(container, doc, row, spriteState, rawHtml);
  console.log(`🔍 [PARSE] После extractFavicon: row['#FaviconImage']="${row['#FaviconImage'] || '(пусто)'}"`);
  
  // #OrganicText
  const textContent = container.querySelector('.OrganicTextContentSpan, [class*="OrganicTextContentSpan"], .EProductSnippet2-Text, [class*="EProductSnippet2-Text"]');
  if (textContent) {
    row['#OrganicText'] = getTextContent(textContent);
  }
  
  // #OrganicImage
  const image = container.querySelector('.Organic-OfferThumbImage, [class*="Organic-OfferThumbImage"], .EProductSnippet2-Thumb img, [class*="EProductSnippet2-Thumb"] img, img');
  if (image) {
    let src = image.getAttribute('src') || image.getAttribute('data-src') || image.getAttribute('srcset');
    if (src && src.includes(' ')) {
      src = src.split(',')[0].trim().split(' ')[0];
    }
    if (src) row['#OrganicImage'] = src.startsWith('http') ? src : `https:${src}`;
  }
  
  // #ThumbImage
  row['#ThumbImage'] = row['#OrganicImage'];
  
  // Функция для форматирования цены с математическим пробелом (U+2009) для тысяч
  const formatPriceWithThinSpace = (priceStr: string): string => {
    if (!priceStr || priceStr.length < 4) return priceStr;
    // Добавляем математический пробел каждые 3 цифры справа налево
    return priceStr.replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
  };

  // Проверяем наличие EPriceGroup-Pair (специальная обработка для цен с скидкой)
  const priceGroupPair = container.querySelector('.EPriceGroup-Pair, [class*="EPriceGroup-Pair"]');
  if (priceGroupPair) {
    console.log('✅ Найден EPriceGroup-Pair, обрабатываем специальную логику цен');
    
    // 1. Устанавливаем Variant Properties для инстанса EPriceGroup
    // Добавляем инструкции для установки "Discount=true" и "Old Price=true"
    // Используем специальные поля, которые будут обработаны в code.ts
    row['#EPriceGroup_Discount'] = 'true';
    row['#EPriceGroup_OldPrice'] = 'true';
    
    // 2. Извлекаем #OrganicPrice из блока с классом EPriceGroup-Price (текущая цена)
    // Ищем .EPrice-Value внутри .EPriceGroup-Price (но не внутри .EPrice_view_old)
    const priceGroupEl = container.querySelector('.EPriceGroup, [class*="EPriceGroup"]');
    if (priceGroupEl) {
      // Ищем цену в .EPriceGroup-Price, но не в .EPrice_view_old
      const currentPriceEl = priceGroupEl.querySelector('.EPriceGroup-Price:not(.EPrice_view_old) .EPrice-Value, [class*="EPriceGroup-Price"]:not([class*="EPrice_view_old"]) .EPrice-Value');
      if (currentPriceEl) {
        const currentPriceText = currentPriceEl.textContent?.trim() || '';
        const currentPriceDigits = currentPriceText.replace(PRICE_DIGITS_REGEX, '');
        if (currentPriceDigits.length >= 1) {
          // Форматируем цену с математическим пробелом
          const formattedPrice = formatPriceWithThinSpace(currentPriceDigits);
          row['#OrganicPrice'] = formattedPrice;
          
          // Также извлекаем валюту
          const currencyEl = priceGroupEl.querySelector('.EPriceGroup-Price:not(.EPrice_view_old) .EPrice-Currency, [class*="EPriceGroup-Price"]:not([class*="EPrice_view_old"]) .EPrice-Currency');
          if (currencyEl) {
            const currencyText = currencyEl.textContent?.trim() || '';
            if (CURRENCY_RUB_REGEX.test(currencyText)) {
              row['#Currency'] = '₽';
            } else if (CURRENCY_USD_REGEX.test(currencyText)) {
              row['#Currency'] = '$';
            } else if (CURRENCY_EUR_REGEX.test(currencyText)) {
              row['#Currency'] = '€';
            }
          }
          console.log(`✅ Извлечена текущая цена из EPriceGroup-Price: ${formattedPrice}`);
        }
      }
    }
    
    // 3. Извлекаем #OldPrice из блока с классом EPrice_view_old
    // Ищем конкретно .EPrice-Value внутри .EPrice_view_old, чтобы избежать дублирования
    const oldPriceEl = priceGroupPair.querySelector('.EPrice_view_old .EPrice-Value, [class*="EPrice_view_old"] .EPrice-Value, .EPrice_view_old [class*="EPrice-Value"]');
    if (oldPriceEl) {
      const oldPriceText = oldPriceEl.textContent?.trim() || '';
      // Очищаем значение цены (убираем все кроме цифр)
      const oldPriceDigits = oldPriceText.replace(PRICE_DIGITS_REGEX, '');
      if (oldPriceDigits.length >= 1) {
        // Форматируем цену с математическим пробелом
        const formattedOldPrice = formatPriceWithThinSpace(oldPriceDigits);
        row['#OldPrice'] = formattedOldPrice;
        console.log(`✅ Извлечена старая цена из EPrice-Value: ${formattedOldPrice}`);
      }
    } else {
      // Fallback: если не нашли .EPrice-Value, пробуем весь элемент
      const oldPriceElFallback = priceGroupPair.querySelector('.EPrice_view_old, [class*="EPrice_view_old"]');
      if (oldPriceElFallback) {
        const oldPriceText = oldPriceElFallback.textContent?.trim() || '';
        const oldPriceDigits = oldPriceText.replace(PRICE_DIGITS_REGEX, '');
        if (oldPriceDigits.length >= 1) {
          // Форматируем цену с математическим пробелом
          const formattedOldPrice = formatPriceWithThinSpace(oldPriceDigits);
          row['#OldPrice'] = formattedOldPrice;
          console.log(`✅ Извлечена старая цена из EPrice_view_old (fallback): ${formattedOldPrice}`);
        }
      }
    }
    
    // 4. Извлекаем #discount из блока с классом LabelDiscount
    // Ищем конкретно .Label-Content внутри .LabelDiscount, где находится текст скидки
    const discountContentEl = priceGroupPair.querySelector('.LabelDiscount .Label-Content, [class*="LabelDiscount"] .Label-Content, .LabelDiscount [class*="Label-Content"]');
    if (discountContentEl) {
      const discountText = discountContentEl.textContent?.trim() || '';
      // Извлекаем число из текста вида "−51%" или "–51%" (может быть минус U+2212 или дефис)
      // Ищем последовательность цифр (с поддержкой математических пробелов)
      const discountMatch = discountText.match(/([\d\s\u2009\u00A0,]+)/);
      if (discountMatch) {
        // Оставляем только цифры и пробелы, убираем запятые и другие символы
        const discountValue = discountMatch[1].replace(/[^\d\s\u2009\u00A0]/g, '').trim();
        // Форматируем как "–{значение}%" (используем обычные пробелы, если были математические)
        const formattedDiscount = `–${discountValue.replace(/[\u2009\u00A0]/g, ' ')}%`;
        row['#discount'] = formattedDiscount;
        // Также сохраняем в DiscountPercent для совместимости
        const discountNumber = discountValue.replace(/\s/g, '');
        if (discountNumber) {
          row['#DiscountPercent'] = discountNumber;
        }
        console.log(`✅ Извлечена скидка из Label-Content: ${formattedDiscount} (исходный текст: "${discountText}")`);
      } else {
        console.warn(`⚠️ Не удалось извлечь число из Label-Content: "${discountText}"`);
      }
    } else {
      // Fallback: если не нашли .Label-Content, пробуем весь элемент LabelDiscount
      const discountLabelEl = priceGroupPair.querySelector('.LabelDiscount, [class*="LabelDiscount"]');
      if (discountLabelEl) {
        const discountText = discountLabelEl.textContent?.trim() || '';
        const discountMatch = discountText.match(/([\d\s\u2009\u00A0,]+)/);
        if (discountMatch) {
          const discountValue = discountMatch[1].replace(/[^\d\s\u2009\u00A0]/g, '').trim();
          const formattedDiscount = `–${discountValue.replace(/[\u2009\u00A0]/g, ' ')}%`;
          row['#discount'] = formattedDiscount;
          const discountNumber = discountValue.replace(/\s/g, '');
          if (discountNumber) {
            row['#DiscountPercent'] = discountNumber;
          }
          console.log(`✅ Извлечена скидка из LabelDiscount (fallback): ${formattedDiscount}`);
        }
      }
    }
  } else {
    // Обычная обработка цен (если нет EPriceGroup-Pair)
    const prices = extractPrices(container);
    // Форматируем цены с математическим пробелом
    row['#OrganicPrice'] = prices.price ? formatPriceWithThinSpace(prices.price) : '';
    row['#Currency'] = prices.currency;
    if (prices.oldPrice) {
      row['#OldPrice'] = formatPriceWithThinSpace(prices.oldPrice);
    }
    
    // #DiscountPercent
    const discount = container.querySelector('.Price-DiscountPercent, [class*="Price-DiscountPercent"], .EProductSnippet2-Discount, [class*="Discount"]');
    if (discount) {
      const discText = discount.textContent?.trim() || '';
      const match = discText.match(DISCOUNT_PERCENT_REGEX);
      if (match) row['#DiscountPercent'] = match[1];
    }
  }
  
  // #ShopRating
  const rating = container.querySelector('.Rating, [class*="Rating"], [aria-label*="рейтинг" i]');
  if (rating) {
    const ratingText = rating.textContent?.trim() || '';
    const match = ratingText.match(RATING_REGEX);
    if (match) row['#ShopRating'] = match[1];
  }
  
  // #ReviewsNumber
  const reviews = container.querySelector('[class*="Review"], [class*="review"], [aria-label*="отзыв" i], .Reviews, [class*="Reviews"]');
  if (reviews) {
    const revText = reviews.textContent?.trim() || '';
    const match = revText.match(REVIEWS_REGEX);
    if (match) row['#ReviewsNumber'] = match[1].trim();
  }
  
  // #ProductRating - парсим из ELabelRating
  // Валидация рейтинга: должно быть число от 0 до 5 с одним знаком после запятой
  const validateRating = (text: string): string | null => {
    if (!text || text.trim() === '') return null;
    
    const trimmed = text.trim();
    
    // Убираем все символы кроме цифр, точки и запятой
    const cleaned = trimmed.replace(/[^\d.,]/g, '');
    
    // Заменяем запятую на точку для парсинга
    const normalized = cleaned.replace(',', '.');
    
    // Парсим число
    const ratingValue = parseFloat(normalized);
    
    // Проверяем, что это валидное число от 0 до 5
    if (isNaN(ratingValue) || ratingValue < 0 || ratingValue > 5) {
      return null;
    }
    
    // Форматируем с одним знаком после запятой
    const formatted = ratingValue.toFixed(1);
    
    // Проверяем, что исходный текст содержит это число (чтобы не захватывать проценты скидки)
    // Если в тексте есть знак процента или минус перед числом, это не рейтинг
    if (trimmed.includes('%') || trimmed.match(/^[\u2212\u002D\u2013\u2014]/)) {
      return null;
    }
    
    return formatted;
  };
  
  // Пробуем разные варианты поиска элемента с рейтингом
  let labelRating = container.querySelector('.ELabelRating, [class*="ELabelRating"]');
  
  // Если не нашли, пробуем найти через другие варианты классов
  if (!labelRating) {
    labelRating = container.querySelector('[class*="LabelRating"], [class*="label-rating"]');
  }
  
  if (labelRating) {
    console.log(`🔍 Найден ELabelRating в сниппете "${row['#OrganicTitle']?.substring(0, 30)}..."`);
    // Ищем значение в div с классом Label-Content внутри ELabelRating
    let labelContent = labelRating.querySelector('.Label-Content, [class*="Label-Content"]');
    
    // Если не нашли, пробуем другие варианты
    if (!labelContent) {
      labelContent = labelRating.querySelector('[class*="label-content"], [class*="LabelContent"]');
    }
    
    // Если не нашли, пробуем просто текстовое содержимое элемента
    if (!labelContent) {
      const ratingText = getTextContent(labelRating);
      if (ratingText && ratingText.trim() !== '') {
        const validatedRating = validateRating(ratingText);
        if (validatedRating) {
          row['#ProductRating'] = validatedRating;
          console.log(`✅ Извлечен рейтинг из ELabelRating (прямой текст): "${validatedRating}" (исходный текст: "${ratingText.trim()}")`);
        } else {
          console.warn(`⚠️ Извлеченное значение не является валидным рейтингом: "${ratingText.trim()}" (ожидается число от 0 до 5)`);
        }
      }
    } else {
      const ratingText = getTextContent(labelContent);
      if (ratingText && ratingText.trim() !== '') {
        const validatedRating = validateRating(ratingText);
        if (validatedRating) {
          row['#ProductRating'] = validatedRating;
          console.log(`✅ Извлечен рейтинг из ELabelRating: "${validatedRating}" (исходный текст: "${ratingText.trim()}")`);
        } else {
          console.warn(`⚠️ Извлеченное значение не является валидным рейтингом: "${ratingText.trim()}" (ожидается число от 0 до 5)`);
        }
      } else {
        console.log(`⚠️ Label-Content найден, но пустой в ELabelRating`);
      }
    }
  } else {
    // Логируем только для первых нескольких сниппетов, чтобы не засорять логи
    const snippetIndex = (row['#OrganicTitle'] || '').length % 10;
    if (snippetIndex < 3) {
      console.log(`⚠️ ELabelRating не найден в сниппете "${row['#OrganicTitle']?.substring(0, 30)}..."`);
    }
  }
  
  // #EPriceBarometer - проверяем наличие и определяем view
  const priceBarometer = container.querySelector('.EPriceBarometer, [class*="EPriceBarometer"]');
  if (priceBarometer) {
    console.log(`🔍 Найден EPriceBarometer в сниппете "${row['#OrganicTitle']?.substring(0, 30)}..."`);
    
    // Устанавливаем Barometer=true для ELabelGroup
    row['#ELabelGroup_Barometer'] = 'true';
    
    // Определяем view на основе дополнительных классов
    const barometerClasses = priceBarometer.className.split(/\s+/);
    let barometerView: string | null = null;
    
    if (barometerClasses.some(cls => cls.includes('EPriceBarometer-Cheap'))) {
      barometerView = 'below-market';
      console.log(`✅ Определен view для EPriceBarometer: below-market (EPriceBarometer-Cheap)`);
    } else if (barometerClasses.some(cls => cls.includes('EPriceBarometer-Average'))) {
      barometerView = 'in-market';
      console.log(`✅ Определен view для EPriceBarometer: in-market (EPriceBarometer-Average)`);
    } else if (barometerClasses.some(cls => cls.includes('EPriceBarometer-Expensive'))) {
      barometerView = 'above-market';
      console.log(`✅ Определен view для EPriceBarometer: above-market (EPriceBarometer-Expensive)`);
    }
    
    if (barometerView) {
      row['#EPriceBarometer_View'] = barometerView;
    } else {
      console.warn(`⚠️ Не удалось определить view для EPriceBarometer. Классы: ${barometerClasses.join(', ')}`);
    }
  } else {
    // Если EPriceBarometer не найден, устанавливаем Barometer=false для ELabelGroup
    row['#ELabelGroup_Barometer'] = 'false';
  }
  
  // Валидация: требуем заголовок и хотя бы один источник
  const hasSource = (row['#OrganicHost'] && row['#OrganicHost'].trim() !== '') || (row['#ShopName'] && row['#ShopName'].trim() !== '');
  if (!row['#OrganicTitle'] || !hasSource) {
    return { row: null, spriteState: spriteState };
  }
  
  return { row: row, spriteState: spriteState };
}

// Дедуплицирует строки по уникальному ключу
function deduplicateRows(rows: CSVRow[]): CSVRow[] {
  const uniqueRows = new Map<string, CSVRow>();
  
  for (const row of rows) {
    // Создаем уникальный ключ из URL или комбинации Title + ShopName
    let uniqueKey = row['#ProductURL'] || '';
    if (!uniqueKey || uniqueKey.trim() === '') {
      const title = (row['#OrganicTitle'] || '').trim();
      const shop = (row['#ShopName'] || row['#OrganicHost'] || '').trim();
      uniqueKey = `${title}|${shop}`;
    }
    
    // Если строка с таким ключом уже есть, объединяем данные (приоритет - строка с изображением)
    if (uniqueRows.has(uniqueKey)) {
      const existingRow = uniqueRows.get(uniqueKey)!;
      if (row['#OrganicImage'] && row['#OrganicImage'].trim() !== '' && 
          (!existingRow['#OrganicImage'] || existingRow['#OrganicImage'].trim() === '')) {
        uniqueRows.set(uniqueKey, row);
      }
    } else {
      uniqueRows.set(uniqueKey, row);
    }
  }
  
  return Array.from(uniqueRows.values());
}

// Парсит JSON из блока noframes и извлекает данные о сниппетах
function parseJsonFromNoframes(html: string): any {
  console.log('🔍 Поиск блока noframes с JSON данными...');
  
  // Ищем блок <noframes id="lazy-react-state-post-search">
  const noframesMatch = html.match(/<noframes[^>]*id=["']lazy-react-state-post-search["'][^>]*>([\s\S]*?)<\/noframes>/i);
  
  if (!noframesMatch || !noframesMatch[1]) {
    console.log('⚠️ Блок noframes с id="lazy-react-state-post-search" не найден');
    return null;
  }
  
  const jsonContent = noframesMatch[1].trim();
  console.log(`✅ Блок noframes найден, размер JSON: ${jsonContent.length} символов`);
  
  try {
    const jsonData = JSON.parse(jsonContent);
    console.log('✅ JSON успешно распарсен');
    return jsonData;
  } catch (error) {
    console.error('❌ Ошибка парсинга JSON:', error);
    return null;
  }
}

// Извлекает фавиконку из JSON сниппета
function extractFaviconFromJson(snippet: any, row: CSVRow): void {
  try {
    // Ищем фавиконку в различных возможных полях JSON
    let faviconData: any = null;
    let faviconField = '';
    
    // Список возможных полей для фавиконки
    const faviconFields = [
      'favicon', 'icon', 'faviconUrl', 'faviconImage', 'siteIcon', 'domainIcon',
      'faviconUrl', 'faviconSrc', 'iconUrl', 'iconSrc', 'siteFavicon',
      'faviconImageUrl', 'faviconImageSrc', 'shopIcon', 'vendorIcon'
    ];
    
    // Ищем фавиконку в прямых полях
    for (const field of faviconFields) {
      if (snippet[field]) {
        faviconData = snippet[field];
        faviconField = field;
        break;
      }
    }
    
    // Если не нашли в прямых полях, ищем во вложенных объектах
    if (!faviconData) {
      const nestedFields = ['site', 'shop', 'vendor', 'domain', 'brand', 'seller', 'merchant'];
      for (const nestedField of nestedFields) {
        if (snippet[nestedField] && typeof snippet[nestedField] === 'object') {
          for (const field of faviconFields) {
            if (snippet[nestedField][field]) {
              faviconData = snippet[nestedField][field];
              faviconField = `${nestedField}.${field}`;
              break;
            }
          }
          if (faviconData) break;
        }
      }
    }
    
    // Если не нашли, ищем в объекте с изображениями
    if (!faviconData && snippet.images && typeof snippet.images === 'object') {
      for (const field of faviconFields) {
        if (snippet.images[field]) {
          faviconData = snippet.images[field];
          faviconField = `images.${field}`;
          break;
        }
      }
    }
    
    if (!faviconData) {
      // Логируем только если это первый сниппет, чтобы не засорять логи
      return;
    }
    
    console.log(`🔍 Фавиконка найдена в поле "${faviconField}" для сниппета "${row['#OrganicTitle']?.substring(0, 30)}..."`);
    
    let faviconUrl: string | null = null;
    let bgPosition: string | null = null;
    let bgSize: string | null = null;
    
    // Обрабатываем разные форматы данных фавиконки
    if (typeof faviconData === 'string') {
      // Простая строка с URL
      faviconUrl = faviconData.trim();
    } else if (typeof faviconData === 'object' && faviconData !== null) {
      // Объект с данными фавиконки
      faviconUrl = faviconData.url || faviconData.src || faviconData.image || faviconData.href || null;
      bgPosition = faviconData.position || faviconData.backgroundPosition || faviconData.bgPosition || null;
      bgSize = faviconData.size || faviconData.backgroundSize || faviconData.bgSize || null;
      
      // Если URL в массиве (список фавиконок)
      if (Array.isArray(faviconData.urls) && faviconData.urls.length > 0) {
        const faviconUrls = faviconData.urls.map((url: string) => url.trim()).filter((url: string) => url.length > 0);
        if (faviconUrls.length > 0) {
          row['#FaviconImage'] = `SPRITE_LIST:${faviconUrls.join('|')}`;
          console.log(`✅ Список фавиконок найден: ${faviconUrls.length} адресов`);
          
          // Извлекаем первый хост для ShopName
          try {
            const firstUrl = faviconUrls[0];
            const urlMatch = firstUrl.match(/\/favicon\/v2\/([^?]+)/);
            if (urlMatch && urlMatch[1]) {
              const decodedHost = decodeURIComponent(urlMatch[1]);
              const hostUrl = new URL(decodedHost.startsWith('http') ? decodedHost : `https://${decodedHost}`);
              row['#OrganicHost'] = hostUrl.hostname;
              if (!row['#ShopName']) {
                row['#ShopName'] = row['#OrganicHost'];
              }
            }
          } catch (e) {
            // Игнорируем ошибки парсинга URL
          }
          
          return;
        }
      }
      
      // Если URL в массиве напрямую
      if (Array.isArray(faviconData) && faviconData.length > 0) {
        const faviconUrls = faviconData.map((url: any) => {
          if (typeof url === 'string') return url.trim();
          if (typeof url === 'object' && url.url) return url.url.trim();
          return null;
        }).filter((url: string | null) => url !== null && url.length > 0);
        
        if (faviconUrls.length > 0) {
          row['#FaviconImage'] = `SPRITE_LIST:${faviconUrls.join('|')}`;
          console.log(`✅ Список фавиконок найден в массиве: ${faviconUrls.length} адресов`);
          
          // Извлекаем первый хост для ShopName
          try {
            const firstUrl = faviconUrls[0];
            const urlMatch = firstUrl.match(/\/favicon\/v2\/([^?]+)/);
            if (urlMatch && urlMatch[1]) {
              const decodedHost = decodeURIComponent(urlMatch[1]);
              const hostUrl = new URL(decodedHost.startsWith('http') ? decodedHost : `https://${decodedHost}`);
              row['#OrganicHost'] = hostUrl.hostname;
              if (!row['#ShopName']) {
                row['#ShopName'] = row['#OrganicHost'];
              }
            }
          } catch (e) {
            // Игнорируем ошибки парсинга URL
          }
          
          return;
        }
      }
    }
    
    if (!faviconUrl || faviconUrl.length === 0) {
      return;
    }
    
    // Очищаем и нормализуем URL
    faviconUrl = faviconUrl.trim().replace(/\s+/g, '');
    
    if (faviconUrl.startsWith('//')) {
      faviconUrl = 'https:' + faviconUrl;
    }
    
    // Проверяем формат URL
    if (!faviconUrl.startsWith('http://') && !faviconUrl.startsWith('https://')) {
      console.warn(`⚠️ Некорректный формат URL фавиконки: ${faviconUrl.substring(0, 50)}...`);
      return;
    }
    
    // Проверяем, является ли это спрайтом с перечислением адресов
    // Формат: //favicon.yandex.net/favicon/v2/https://site1;https://site2;...;https://siteN?size=32&stub=1&reqid=...
    // Извлекаем список доменов: берем все после /favicon/v2/
    const spriteListMatch = faviconUrl.match(/favicon\.yandex\.net\/favicon\/v2\/(.+)/i);
    if (spriteListMatch && spriteListMatch[1]) {
      let addressesString = spriteListMatch[1];
      
      // Разделяем по точке с запятой (параметры запроса могут быть в последнем домене)
      const addresses = addressesString.split(';').filter(addr => addr.trim().length > 0);
      
      if (addresses.length > 0) {
        // Создаем список URL фавиконок для каждого адреса
        const faviconUrls = addresses.map(addr => {
          const cleanAddr = addr.trim();
          // Убираем возможные параметры из адреса (если они есть, например в последнем домене)
          // Например: https://yandex.ru/products?size=32&stub=1&reqid=... -> https://yandex.ru/products
          const cleanAddrWithoutParams = cleanAddr.split('?')[0];
          // Формируем URL фавиконки для единичного домена
          return `https://favicon.yandex.net/favicon/v2/${encodeURIComponent(cleanAddrWithoutParams)}?size=32&stub=1`;
        });
        
        // Сохраняем список в специальном формате: SPRITE_LIST:url1|url2|url3|...
        row['#FaviconImage'] = `SPRITE_LIST:${faviconUrls.join('|')}`;
        const firstDomain = addresses[0].trim().split('?')[0];
        const firstFaviconUrl = faviconUrls[0];
        console.log(`✅ Спрайт-список фавиконок найден: ${addresses.length} адресов, первый домен: ${firstDomain}, первая фавиконка: ${firstFaviconUrl}`);
        
        // Извлекаем первый хост для текущего сниппета
        const firstHost = firstDomain;
        try {
          const hostUrl = new URL(firstHost.startsWith('http') ? firstHost : `https://${firstHost}`);
          row['#OrganicHost'] = hostUrl.hostname;
          if (!row['#ShopName']) {
            row['#ShopName'] = row['#OrganicHost'];
          }
        } catch (e) {
          // Игнорируем ошибки парсинга URL
        }
        
        return;
      }
    }
    
    // Если есть background-position (спрайт), сохраняем в специальном формате
    // Формат: URL|position|size (например: url|-20px|20px)
    if (bgPosition) {
      bgPosition = bgPosition.trim().replace(/\s+/g, ' ');
      const spriteData = bgSize ? `${faviconUrl}|${bgPosition}|${bgSize}` : `${faviconUrl}|${bgPosition}`;
      row['#FaviconImage'] = spriteData;
      console.log(`✅ Фавиконка-спрайт найдена: ${faviconUrl.substring(0, 60)}... позиция: ${bgPosition}${bgSize ? `, размер: ${bgSize}` : ''}`);
    } else {
      row['#FaviconImage'] = faviconUrl;
      console.log(`✅ Фавиконка найдена: ${faviconUrl.substring(0, 80)}...`);
    }
    
    // Извлекаем хост из URL фавиконки
    const hostMatch = faviconUrl.match(/\/favicon\/v2\/([^\?\/;]+)/);
    if (hostMatch && hostMatch[1]) {
      const firstHost = hostMatch[1].split(';')[0];
      try {
        row['#OrganicHost'] = decodeURIComponent(firstHost);
        if (!row['#ShopName']) {
          row['#ShopName'] = row['#OrganicHost'];
        }
      } catch (e) {
        // Игнорируем ошибки декодирования
      }
    }
  } catch (e) {
    console.error('❌ Ошибка извлечения фавиконки из JSON:', e);
  }
}

// Собирает все уникальные поля из массива объектов
function collectAllFields(obj: any, prefix: string = '', depth: number = 0, maxDepth: number = 5): Set<string> {
  const fields = new Set<string>();
  
  if (depth > maxDepth) return fields;
  
  if (Array.isArray(obj) && obj.length > 0) {
    // Обрабатываем первый элемент массива
    const first = obj[0];
    if (first && typeof first === 'object') {
      const nestedFields = collectAllFields(first, prefix, depth + 1, maxDepth);
      nestedFields.forEach(f => fields.add(f));
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        fields.add(fullKey);
        
        // Рекурсивно обрабатываем вложенные объекты
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          const nestedFields = collectAllFields(obj[key], fullKey, depth + 1, maxDepth);
          nestedFields.forEach(f => fields.add(f));
        }
      }
    }
  }
  
  return fields;
}

// Извлекает данные о сниппетах из JSON структуры Яндекс.Поиска
function extractSnippetsFromJson(jsonData: any): CSVRow[] {
  const results: CSVRow[] = [];
  
  console.log('🔍 Извлечение данных из JSON...');
  console.log('📊 Верхнеуровневые ключи JSON:', Object.keys(jsonData));
  
  // Собираем все поля из JSON для логирования
  const allFields = collectAllFields(jsonData);
  console.log('📋 Все поля, обнаруженные в JSON:');
  const sortedFields = Array.from(allFields).sort();
  sortedFields.forEach(field => {
    console.log(`   - ${field}`);
  });
  console.log(`📊 Всего уникальных полей в JSON: ${allFields.size}`);
  
  // Ищем данные о сниппетах в различных возможных местах JSON структуры
  // Обычно данные находятся в структуре типа: results, items, snippets, organic, products и т.д.
  
  let snippets: any[] = [];
  let foundPath = '';
  
  // Пробуем различные пути к данным
  if (jsonData.results && Array.isArray(jsonData.results)) {
    snippets = jsonData.results;
    foundPath = 'results';
  } else if (jsonData.items && Array.isArray(jsonData.items)) {
    snippets = jsonData.items;
    foundPath = 'items';
  } else if (jsonData.snippets && Array.isArray(jsonData.snippets)) {
    snippets = jsonData.snippets;
    foundPath = 'snippets';
  } else if (jsonData.organic && Array.isArray(jsonData.organic)) {
    snippets = jsonData.organic;
    foundPath = 'organic';
  } else if (jsonData.products && Array.isArray(jsonData.products)) {
    snippets = jsonData.products;
    foundPath = 'products';
  } else if (jsonData.data && jsonData.data.results && Array.isArray(jsonData.data.results)) {
    snippets = jsonData.data.results;
    foundPath = 'data.results';
  } else if (jsonData.data && jsonData.data.items && Array.isArray(jsonData.data.items)) {
    snippets = jsonData.data.items;
    foundPath = 'data.items';
  } else if (Array.isArray(jsonData)) {
    snippets = jsonData;
    foundPath = 'root array';
  } else {
    // Рекурсивно ищем массивы в структуре
    function findArrays(obj: any, path: string = '', depth: number = 0): { array: any[]; path: string } | null {
      if (depth > 5) return null; // Ограничиваем глубину поиска
      
      if (Array.isArray(obj) && obj.length > 0) {
        // Проверяем, похож ли первый элемент на сниппет
        const first = obj[0];
        if (first && typeof first === 'object') {
          const keys = Object.keys(first);
          if (keys.some(k => k.toLowerCase().includes('title') || k.toLowerCase().includes('url') || k.toLowerCase().includes('price'))) {
            return { array: obj, path: path || 'root array' };
          }
        }
      }
      
      if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const newPath = path ? `${path}.${key}` : key;
            const found = findArrays(obj[key], newPath, depth + 1);
            if (found) return found;
          }
        }
      }
      
      return null;
    }
    
    const found = findArrays(jsonData);
    if (found) {
      snippets = found.array;
      foundPath = found.path;
    }
  }
  
  if (foundPath) {
    console.log(`📦 Найдено ${snippets.length} потенциальных сниппетов в JSON по пути: ${foundPath}`);
  } else {
    console.log(`⚠️ Не найдено массивов со сниппетами в JSON`);
  }
  
  if (snippets.length === 0) {
    console.log('⚠️ Не найдено массивов со сниппетами. Структура JSON:', JSON.stringify(jsonData).substring(0, 500));
    return [];
  }
  
  // Собираем все уникальные поля из всех сниппетов
  const snippetFieldsSet = new Set<string>();
  for (const snippet of snippets) {
    if (snippet && typeof snippet === 'object') {
      const fields = collectAllFields(snippet);
      fields.forEach(f => snippetFieldsSet.add(f));
    }
  }
  console.log(`📋 Уникальные поля из всех сниппетов (${snippetFieldsSet.size} полей):`);
  const sortedSnippetFields = Array.from(snippetFieldsSet).sort();
  sortedSnippetFields.forEach(field => {
    console.log(`   - ${field}`);
  });
  
  // Логируем детальную структуру первого сниппета для отладки
  if (snippets.length > 0 && snippets[0] && typeof snippets[0] === 'object') {
    const firstSnippet = snippets[0];
    const firstSnippetFields = Object.keys(firstSnippet);
    console.log(`📋 Поля первого сниппета (${firstSnippetFields.length} полей):`);
    firstSnippetFields.forEach(field => {
      const value = firstSnippet[field];
      const valueType = typeof value;
      let valuePreview = '';
      if (valueType === 'string') {
        valuePreview = value.length > 50 ? value.substring(0, 50) + '...' : value;
      } else if (valueType === 'object') {
        if (Array.isArray(value)) {
          valuePreview = `[Array(${value.length})]`;
        } else if (value === null) {
          valuePreview = 'null';
        } else {
          valuePreview = `{${Object.keys(value).join(', ')}}`;
        }
      } else {
        valuePreview = String(value);
      }
      console.log(`   - ${field}: ${valueType} = ${valuePreview}`);
    });
  }
  
  // Преобразуем каждый сниппет в CSVRow
  for (let i = 0; i < snippets.length; i++) {
    const snippet = snippets[i];
    if (!snippet || typeof snippet !== 'object') continue;
    
    const row: CSVRow = {
      '#SnippetType': snippet.type || snippet.snippetType || 'Organic_withOfferInfo',
      '#ProductURL': snippet.url || snippet.link || snippet.href || snippet.productUrl || '',
      '#OrganicTitle': snippet.title || snippet.name || snippet.headline || snippet.text || '',
      '#ShopName': snippet.shopName || snippet.shop || snippet.vendor || snippet.domain || '',
      '#OrganicHost': '',
      '#OrganicPath': snippet.path || snippet.breadcrumbs || '',
      '#SnippetFavicon': '',
      '#FaviconImage': '',
      '#OrganicText': snippet.description || snippet.text || snippet.snippet || '',
      '#OrganicImage': snippet.image || snippet.thumbnail || snippet.thumb || snippet.img || '',
      '#ThumbImage': snippet.thumbnail || snippet.thumb || snippet.image || '',
      '#OrganicPrice': '',
      '#Currency': '',
      '#PriceInfo': '',
      '#OldPrice': '',
      '#DiscountPercent': '',
      '#ShopRating': snippet.rating || snippet.stars || '',
      '#ReviewsNumber': snippet.reviews || snippet.reviewsCount || '',
      '#LabelsList': '',
      '#DeliveryList': '',
      '#FintechList': '',
      '#QuoteImage': '',
      '#QuoteText': '',
      '#Availability': '',
      '#PickupOptions': '',
      '#DeliveryETA': ''
    };
    
    // Извлекаем хост из URL
    if (row['#ProductURL']) {
      try {
        const url = row['#ProductURL'].startsWith('http') ? row['#ProductURL'] : `https://${row['#ProductURL']}`;
        const u = new URL(url);
        row['#OrganicHost'] = u.hostname;
        if (!row['#ShopName']) {
          row['#ShopName'] = u.hostname;
        }
      } catch (e) {
        // ignore
      }
    }
    
    // Обрабатываем цену
    if (snippet.price) {
      if (typeof snippet.price === 'number') {
        row['#OrganicPrice'] = snippet.price.toString();
      } else if (typeof snippet.price === 'string') {
        const priceMatch = snippet.price.match(/([\d\s,]+)/);
        if (priceMatch) {
          row['#OrganicPrice'] = priceMatch[1].replace(/\s/g, '');
        }
        if (snippet.price.includes('₽') || snippet.price.includes('руб')) {
          row['#Currency'] = '₽';
        } else if (snippet.price.includes('$')) {
          row['#Currency'] = '$';
        } else if (snippet.price.includes('€')) {
          row['#Currency'] = '€';
        }
      } else if (snippet.price.value) {
        row['#OrganicPrice'] = snippet.price.value.toString();
        row['#Currency'] = snippet.price.currency || '₽';
      }
    }
    
    // Обрабатываем старую цену
    if (snippet.oldPrice) {
      if (typeof snippet.oldPrice === 'number') {
        row['#OldPrice'] = snippet.oldPrice.toString();
      } else if (typeof snippet.oldPrice === 'string') {
        const oldPriceMatch = snippet.oldPrice.match(/([\d\s,]+)/);
        if (oldPriceMatch) {
          row['#OldPrice'] = oldPriceMatch[1].replace(/\s/g, '');
        }
      } else if (snippet.oldPrice.value) {
        row['#OldPrice'] = snippet.oldPrice.value.toString();
      }
    }
    
    // Обрабатываем скидку
    if (snippet.discount || snippet.discountPercent) {
      const discount = snippet.discount || snippet.discountPercent;
      if (typeof discount === 'number') {
        row['#DiscountPercent'] = discount.toString();
      } else if (typeof discount === 'string') {
        const discMatch = discount.match(/([\d,]+)/);
        if (discMatch) {
          row['#DiscountPercent'] = discMatch[1];
        }
      }
    }
    
    // Обрабатываем фавиконку из JSON
    extractFaviconFromJson(snippet, row);
    
    // Нормализуем URL изображений
    if (row['#OrganicImage'] && !row['#OrganicImage'].startsWith('http')) {
      row['#OrganicImage'] = row['#OrganicImage'].startsWith('//') ? `https:${row['#OrganicImage']}` : `https://${row['#OrganicImage']}`;
    }
    if (row['#ThumbImage'] && !row['#ThumbImage'].startsWith('http')) {
      row['#ThumbImage'] = row['#ThumbImage'].startsWith('//') ? `https:${row['#ThumbImage']}` : `https://${row['#ThumbImage']}`;
    }
    if (row['#FaviconImage'] && !row['#FaviconImage'].startsWith('http') && !row['#FaviconImage'].startsWith('SPRITE_LIST:')) {
      row['#FaviconImage'] = row['#FaviconImage'].startsWith('//') ? `https:${row['#FaviconImage']}` : `https://${row['#FaviconImage']}`;
    }
    
    // Валидация: требуем заголовок и хотя бы один источник
    const hasSource = (row['#OrganicHost'] && row['#OrganicHost'].trim() !== '') || (row['#ShopName'] && row['#ShopName'].trim() !== '');
    if (row['#OrganicTitle'] && hasSource) {
      results.push(row);
    }
  }
  
  console.log(`✅ Извлечено ${results.length} валидных сниппетов из JSON`);
  
  return results;
}

// Parse MHTML file and extract HTML content
export function parseMhtmlFile(mhtmlContent: string): string {
  console.log('📦 Парсинг MHTML файла...');
  console.log('📄 Размер MHTML:', mhtmlContent.length);
  
  // Находим boundary из заголовка Content-Type (может быть в разных форматах)
  let boundary: string | null = null;
  
  // Вариант 1: Content-Type: multipart/related; boundary="..."
  const contentTypeMatch1 = mhtmlContent.match(/Content-Type:\s*multipart\/related[^;\r\n]*;\s*boundary=["']?([^"'\r\n;]+)["']?/i);
  if (contentTypeMatch1 && contentTypeMatch1[1]) {
    boundary = contentTypeMatch1[1].trim();
  }
  
  // Вариант 2: boundary может быть на отдельной строке
  if (!boundary) {
    const boundaryMatch = mhtmlContent.match(/boundary=["']?([^"'\r\n;]+)["']?/i);
    if (boundaryMatch && boundaryMatch[1]) {
      boundary = boundaryMatch[1].trim();
    }
  }
  
  // Вариант 3: Ищем boundary в начале файла (обычно после Content-Type)
  if (!boundary) {
    const firstLines = mhtmlContent.substring(0, 2000);
    const boundaryInHeader = firstLines.match(/boundary=([^\s\r\n"';]+)/i);
    if (boundaryInHeader && boundaryInHeader[1]) {
      boundary = boundaryInHeader[1].trim();
    }
  }
  
  if (!boundary) {
    console.warn('⚠️ Не найден boundary в MHTML, пытаемся найти HTML напрямую...');
    // Пробуем найти HTML напрямую
    const htmlMatch = mhtmlContent.match(/<!DOCTYPE[^>]*>[\s\S]*<\/html>/i);
    if (htmlMatch) {
      return htmlMatch[0];
    }
    throw new Error('Не удалось найти HTML в MHTML файле');
  }
  
  console.log(`✅ Найден boundary: ${boundary}`);
  
  // Разделяем файл по boundary (может быть с -- или без)
  // Пробуем разные варианты разделения
  let parts: string[] = [];
  if (mhtmlContent.includes(`--${boundary}`)) {
    parts = mhtmlContent.split(`--${boundary}`);
  } else if (mhtmlContent.includes(boundary)) {
    parts = mhtmlContent.split(boundary);
  } else {
    throw new Error('Не удалось разделить MHTML по boundary');
  }
  
  // Ищем часть с Content-Type: text/html
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    // Пропускаем пустые части и финальную часть (обычно заканчивается на --)
    if (!part || part.trim().length === 0 || part.trim() === '--') {
      continue;
    }
    
    // Проверяем Content-Type
    const partContentTypeMatch = part.match(/Content-Type:\s*([^;\r\n]+)/i);
    if (partContentTypeMatch) {
      const partContentType = partContentTypeMatch[1].trim().toLowerCase();
      
      if (partContentType.includes('text/html')) {
        console.log(`✅ Найдена HTML часть (часть ${i + 1})`);
        
        // Извлекаем содержимое (после двойного переноса строки)
        const contentMatch = part.match(/\r?\n\r?\n([\s\S]*)$/);
        if (!contentMatch) {
          continue;
        }
        
        let htmlContent = contentMatch[1];
        
        // Проверяем Content-Transfer-Encoding
        const encodingMatch = part.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);
        if (encodingMatch) {
          const encoding = encodingMatch[1].trim().toLowerCase();
          
          if (encoding === 'quoted-printable') {
            // Декодируем quoted-printable
            console.log('📝 Декодирование quoted-printable...');
            htmlContent = htmlContent
              .replace(/=\r?\n/g, '') // Убираем мягкие переносы строк
              .replace(/=([0-9A-F]{2})/gi, (match, hex) => {
                return String.fromCharCode(parseInt(hex, 16));
              })
              .replace(/=\r?\n/g, ''); // Еще раз на всякий случай
          } else if (encoding === 'base64') {
            // Декодируем base64
            console.log('📝 Декодирование base64...');
            try {
              // Убираем пробелы и переносы строк
              const base64Content = htmlContent.replace(/\s/g, '');
              // В браузере используем atob для декодирования base64
              const binaryString = atob(base64Content);
              // Преобразуем в строку
              htmlContent = Array.from(binaryString, char => String.fromCharCode(char.charCodeAt(0))).join('');
            } catch (e) {
              console.warn('⚠️ Ошибка декодирования base64, используем как есть:', e);
            }
          }
        }
        
        // Убираем возможные финальные boundary маркеры
        htmlContent = htmlContent.replace(/--\s*$/, '').trim();
        
        console.log(`✅ HTML извлечен, размер: ${htmlContent.length} символов`);
        return htmlContent;
      }
    }
  }
  
  // Если не нашли HTML часть, пробуем найти HTML напрямую
  console.warn('⚠️ HTML часть не найдена по Content-Type, ищем HTML напрямую...');
  const htmlMatch = mhtmlContent.match(/<!DOCTYPE[^>]*>[\s\S]*<\/html>/i);
  if (htmlMatch) {
    console.log('✅ HTML найден напрямую');
    return htmlMatch[0];
  }
  
  throw new Error('Не удалось найти HTML содержимое в MHTML файле');
}

// Parse Yandex search results from HTML
export function parseYandexSearchResults(html: string, fullMhtml?: string): { rows: CSVRow[], error?: string } {
  console.log('🔍 HTML разбор начат');
  try {
  console.log('📄 Размер HTML:', html.length);
  if (fullMhtml) {
    console.log('📄 Размер полного содержимого файла:', fullMhtml.length);
  }
  
  // ДИАГНОСТИКА: Проверяем наличие <style> тегов в сыром HTML до парсинга
  const rawStyleMatches = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  const rawStyleCount = rawStyleMatches ? rawStyleMatches.length : 0;
  console.log(`🔍 [DIAGNOSTIC] Найдено <style> тегов в сыром HTML: ${rawStyleCount}`);
  if (rawStyleCount > 0 && rawStyleMatches) {
    console.log(`   - Примеры найденных <style> тегов (первые 200 символов каждого):`);
    rawStyleMatches.slice(0, 3).forEach((match, idx) => {
      const preview = match.substring(0, 200).replace(/\n/g, ' ').replace(/\s+/g, ' ');
      console.log(`     ${idx + 1}. ${preview}...`);
    });
  }
  
  // ДИАГНОСТИКА: Проверяем наличие <link> тегов со стилями
  const linkMatches = html.match(/<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi);
  const linkCount = linkMatches ? linkMatches.length : 0;
  console.log(`🔍 [DIAGNOSTIC] Найдено <link rel="stylesheet"> тегов: ${linkCount}`);
  
  // Создаем DOM парсер для разбора HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Находим и фильтруем контейнеры сниппетов
  const allContainers = findSnippetContainers(doc);
  const containers = filterTopLevelContainers(allContainers);
  console.log(`📦 Найдено контейнеров-сниппетов (после дедупликации и удаления вложенных): ${containers.length}`);
  
  // Если не нашли стандартные контейнеры, пытаемся найти любые элементы с данными о товарах
  if (containers.length === 0) {
    console.log('⚠️ Стандартные контейнеры не найдены, ищем альтернативные элементы...');
    const altContainers = [
      ...Array.from(doc.querySelectorAll('[class*="Snippet"]')),
      ...Array.from(doc.querySelectorAll('[class*="Product"]')),
      ...Array.from(doc.querySelectorAll('[class*="Item"]'))
    ];
    console.log(`🔍 Альтернативных элементов найдено: ${altContainers.length}`);
    if (altContainers.length > 0) {
      console.log('📋 Примеры классов:', Array.from(altContainers).slice(0, 10).map(el => el.className));
    }
  }
  
  // Извлекаем данные из каждого контейнера
  const results: CSVRow[] = [];
  let spriteState: { urls: string[]; currentIndex: number } | null = null;
  
  for (const container of containers) {
    // Передаем полный контент (или html, если полного нет) для поиска спрайтов
    const result = extractRowData(container, doc, spriteState, fullMhtml || html);
    spriteState = result.spriteState; // Обновляем состояние спрайта
    if (result.row) {
      results.push(result.row);
    }
  }
  
  // Дедуплицируем результаты
  const finalResults = deduplicateRows(results);
  console.log(`📊 Дедупликация: ${results.length} → ${finalResults.length} уникальных строк`);
  
  return { rows: finalResults };
  } catch (e) {
    console.error('Error in parseYandexSearchResults:', e);
    return { rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}

// Create sheet from parsed data
export async function createSheetFromParsedData(data: CSVRow[]): Promise<string> {
  const timestamp = new Date().toISOString().slice(0, 10);
  const sheetName = `parsed_${timestamp}`;
  
  try {
    const url = `${APPS_SCRIPT_URL}?action=createSheet&spreadsheetId=${SPREADSHEET_ID}&sheetName=${encodeURIComponent(sheetName)}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    
    const result = await response.json();
    
    if (!result.ok) {
      throw new Error(result.error || 'Failed to create sheet');
    }
    
    return sheetName;
  } catch (error) {
    console.error('Error creating sheet:', error);
    throw error;
  }
}
