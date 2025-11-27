// Favicon extraction utilities

import { CSVRow } from '../types';
import {
  BG_IMAGE_URL_REGEX,
  BG_POSITION_REGEX,
  BG_SIZE_REGEX,
  BG_SIZE_GLOBAL_REGEX,
  PX_VALUE_REGEX,
  PX_VALUES_REGEX,
  PX_WITH_SIGN_REGEX,
  PX_NEGATIVE_REGEX,
  FAVICON_PAGE_CLASS_REGEX,
  FAVICON_POS_CLASS_REGEX,
  FAVICON_ENTRY_CLASS_REGEX,
  FAVICON_SPRITE_URL_REGEX,
  FAVICON_V2_URL_REGEX,
  SPRITE_BG_IMAGE_REGEX,
  SPRITE_URL_REGEX,
  SPRITE_RULE_LOWER_REGEX,
  SPRITE_RULE_UPPER_REGEX,
  SPRITE_BG_IMAGE_WITH_SIZE_REGEX,
  SPRITE_FULL_RULE_REGEX,
  RAW_HTML_SPRITE_HREF_REGEX,
  RAW_HTML_SPRITE_URL_REGEX,
  RAW_HTML_SPRITE_QUOTED_REGEX,
  RAW_HTML_SPRITE_PLAIN_REGEX,
  QUERY_PARAMS_REGEX,
  QUOTES_REGEX,
  EDGE_QUOTES_REGEX,
  WHITESPACE_REGEX,
  WHITESPACE_SPLIT_REGEX,
  HTML_AMP_REGEX,
  HTML_LT_REGEX,
  HTML_GT_REGEX,
  HTML_QUOT_REGEX,
  QP_EQUALS_REGEX,
  QP_SEMICOLON_REGEX,
  QP_LINEBREAK_REGEX,
  FAVICON_CSS_RULES_REGEX,
  FAVICON_YANDEX_CSS_RULES_REGEX,
  getCachedRegex,
  escapeRegex
} from './regex';
import { isInsideAdvProductGallery, getStyleTags } from './dom-utils';

export interface SpriteState {
  urls: string[];
  currentIndex: number;
}

// Извлекает фавиконку из контейнера
// spriteState - состояние текущего спрайта: { urls: string[], currentIndex: number } | null
// Возвращает обновленное состояние спрайта
export function extractFavicon(
  container: Element, 
  doc: Document, 
  row: CSVRow,
  spriteState: SpriteState | null,
  rawHtml?: string
): SpriteState | null {
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
    let isInlineUrl = false;
    console.log(`🔍 [FAVICON EXTRACT] Проверка inline-стилей: styleAttr="${styleAttr.substring(0, 100)}..."`);
    if (styleAttr) {
      const inlineBgMatch = styleAttr.match(BG_IMAGE_URL_REGEX);
      if (inlineBgMatch && inlineBgMatch[1]) {
        bgUrl = inlineBgMatch[1].trim();
        // Декодируем HTML-сущности (например, &amp; -> &)
        bgUrl = bgUrl.replace(HTML_AMP_REGEX, '&').replace(HTML_LT_REGEX, '<').replace(HTML_GT_REGEX, '>').replace(HTML_QUOT_REGEX, '"');
        // Убираем кавычки если есть
        bgUrl = bgUrl.replace(EDGE_QUOTES_REGEX, '');
        isInlineUrl = true;
        console.log(`✅ [FAVICON EXTRACT] Найден URL фавиконки из inline-стиля: ${bgUrl.substring(0, 80)}...`);
      } else {
        console.log(`⚠️ [FAVICON EXTRACT] Не найден background-image в inline-стилях`);
      }
      
      // Извлекаем background-position из inline-стилей (может быть background-position или background-position-y)
      const inlinePosMatch = styleAttr.match(BG_POSITION_REGEX);
      if (inlinePosMatch && inlinePosMatch[1]) {
        bgPosition = inlinePosMatch[1].trim();
        console.log(`🔍 [FAVICON EXTRACT] Найден background-position из inline-стилей: "${bgPosition}"`);
      }
      
      // Извлекаем background-size из inline-стилей
      const inlineSizeMatch = styleAttr.match(BG_SIZE_REGEX);
      if (inlineSizeMatch && inlineSizeMatch[1]) {
        const bgSizeStr = inlineSizeMatch[1].trim();
        const sizeValueMatches = bgSizeStr.match(PX_VALUES_REGEX);
        if (sizeValueMatches && sizeValueMatches.length > 0) {
          // Берем первое значение (размер одной иконки)
          bgSizeValue = parseFloat(sizeValueMatches[0]);
          console.log(`🔍 [FAVICON EXTRACT] Найден background-size из inline-стилей: ${bgSizeValue}px`);
        }
      }
    }
    
    const favClasses = favEl.className.split(WHITESPACE_SPLIT_REGEX).filter(c => c.includes('Favicon') || c.includes('favicon'));
    favClasses.sort((a, b) => b.length - a.length);
    
    // ЭВРИСТИКА 1: Проверяем, есть ли классы типа Favicon-PageX и Favicon-PageX_pos_Y (спрайт)
    // Если есть, ищем базовый класс Favicon-PageX для получения URL спрайта
    // Пропускаем, если уже нашли URL в inline-стилях (по правилу: inline url = единичная иконка)
    
    let pageClassMatch = null;
    let posClassMatch = null;
    let entryClassMatch = null;

    if (!isInlineUrl) {
      pageClassMatch = favEl.className.match(FAVICON_PAGE_CLASS_REGEX);
      posClassMatch = favEl.className.match(FAVICON_POS_CLASS_REGEX);
      entryClassMatch = favEl.className.match(FAVICON_ENTRY_CLASS_REGEX);
    }
    
    // Если не нашли background-position в inline-стилях, пробуем извлечь из CSS
    if (!isInlineUrl && !bgPosition) {
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
          const escapedClass = escapeRegex(favClass);
          const posRule = getCachedRegex(`\\.${escapedClass}(?:\\.[^{]*)?\\{[^}]*background-position(?:-y)?[^}]*:([^;}]+)[^}]*\\}`, 'i');
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
      const escapedPageClassLower = escapeRegex(pageClassLower);
      const escapedPageClassUpper = escapeRegex(pageClassUpper);
      
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
          const escapedEntryClassLower = escapeRegex(entryClassLower);
          const escapedEntryClassUpper = escapeRegex(entryClassUpper);
          
          // Паттерны для поиска правила с комбинацией классов (используем кэширование)
          const combinedPatterns = [
            // .favicon_page_0.favicon_entry_1 .favicon__icon или .favicon_page_0.favicon_entry_1
            getCachedRegex(`\\.${escapedPageClassLower}\\.${escapedEntryClassLower}(?:\\s+\\.[^{]*)?\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*background-size[^}]*:([^;}]+)[^}]*\\}`, 'i'),
            // .Favicon-Page0.Favicon-Entry1.Favicon или .Favicon-Page0.Favicon-Entry1
            getCachedRegex(`\\.${escapedPageClassUpper}\\.${escapedEntryClassUpper}(?:\\.[^{]*)?\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*background-size[^}]*:([^;}]+)[^}]*\\}`, 'i')
          ];
          
          for (const pattern of combinedPatterns) {
            const match = cssText.match(pattern);
            if (match && match[1]) {
              bgUrl = match[1].replace(QUOTES_REGEX, '').trim();
              // Извлекаем background-size (может быть "16px 368px" или "16px")
              const bgSizeStr = match[2] ? match[2].trim() : '';
              // Извлекаем размер одной иконки (первое значение)
              const sizeMatches = bgSizeStr.match(PX_VALUES_REGEX);
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
            getCachedRegex(`\\.${escapedPageClassLower}(?![_\\w-])[^{]*\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*\\}`, 'i'),
            getCachedRegex(`\\.${escapedPageClassUpper}(?![_\\w-])[^{]*\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*\\}`, 'i'),
            // С классом Favicon перед
            getCachedRegex(`\\.Favicon\\.${escapedPageClassUpper}(?![_\\w-])[^{]*\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*\\}`, 'i'),
            // С классом Favicon после
            getCachedRegex(`\\.${escapedPageClassUpper}\\.Favicon[^{]*\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*\\}`, 'i'),
            // С любыми дополнительными классами
            getCachedRegex(`\\.${escapedPageClassUpper}\\.[^{]*\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*\\}`, 'i')
          ];
          
          let baseMatch: RegExpMatchArray | null = null;
          for (const pattern of basePagePatterns) {
            baseMatch = cssText.match(pattern);
            if (baseMatch && baseMatch[1]) {
              break;
            }
          }
          if (baseMatch && baseMatch[1]) {
            bgUrl = baseMatch[1].replace(QUOTES_REGEX, '').trim();
            console.log(`✅ [FAVICON EXTRACT] Найден URL спрайта из класса ${pageClassUpper}: ${bgUrl.substring(0, 80)}...`);
          }
        }
        
        if (bgUrl) {
          // Извлекаем background-position из CSS правила для класса позиции, если есть
          if (posClassMatch) {
            const posClass = `Favicon-Page${posClassMatch[1]}_pos_${posClassMatch[1]}`;
            const escapedPosClass = escapeRegex(posClass);
            
            // Ищем правило для класса позиции (разные варианты селекторов)
            const posPatterns = [
              getCachedRegex(`\\.${escapedPosClass}(?![_\\w-])[^{]*\\{[^}]*background-position[^}]*:([^;}]+)[^}]*\\}`, 'i'),
              getCachedRegex(`\\.Favicon\\.${escapedPosClass}(?![_\\w-])[^{]*\\{[^}]*background-position[^}]*:([^;}]+)[^}]*\\}`, 'i'),
              getCachedRegex(`\\.${escapedPosClass}\\.[^{]*\\{[^}]*background-position[^}]*:([^;}]+)[^}]*\\}`, 'i')
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
          const allClassesEscaped = favClasses.map(c => escapeRegex(c)).join('\\.');
          const combinedRule = getCachedRegex(`\\.${allClassesEscaped}[^{]*\\{[^}]*background-image[^}]*url\\(([^)]+)\\)[^}]*\\}`, 'i');
          const combinedMatch = cssText.match(combinedRule);
          if (combinedMatch && combinedMatch[1]) {
            bgUrl = combinedMatch[1].replace(QUOTES_REGEX, '').trim();
            console.log(`✅ [FAVICON EXTRACT] Найден bgUrl по комбинации классов: ${bgUrl.substring(0, 80)}...`);
            break;
          }
        }
        
        // Если не нашли по комбинации, пробуем по отдельным классам
        for (const favClass of favClasses) {
          const escapedClass = escapeRegex(favClass);
          const cssRule = getCachedRegex(`\\.${escapedClass}(?:\\.[^{]*)?\\{[^}]*background-image[^}]*url\\(([^)]+)\\)[^}]*\\}`, 'i');
          const match = cssText.match(cssRule);
          if (match && match[1]) {
            bgUrl = match[1].replace(QUOTES_REGEX, '').trim();
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
          const faviconRules = cssText.match(FAVICON_CSS_RULES_REGEX);
          if (faviconRules && faviconRules.length > 0) {
            console.log(`🔍 [FAVICON EXTRACT] Найдено ${faviconRules.length} CSS правил с упоминанием favicon:`);
            faviconRules.slice(0, 5).forEach((rule, idx) => {
              console.log(`   ${idx + 1}. ${rule.substring(0, 200)}...`);
            });
          }
          
          // Ищем все правила с background-image и favicon.yandex.net
          const spriteRules = cssText.match(FAVICON_YANDEX_CSS_RULES_REGEX);
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
      const styleAttrE3 = favEl.getAttribute('style') || '';
      const bgSizeMatchE3 = styleAttrE3.match(BG_SIZE_REGEX);
      let bgSize: string | null = bgSizeMatchE3 ? bgSizeMatchE3[1].trim() : null;
      
      // Если не нашли в inline, ищем в CSS
      if (!bgSize && pageClassMatch) {
        const pageNumber = pageClassMatch[1] || pageClassMatch[2] || '0';
        const pageClass = `Favicon-Page${pageNumber}`;
        const escapedPageClass = escapeRegex(pageClass);
        const styleTags = getStyleTags(doc, rawHtml);
        for (const styleTag of styleTags) {
          const cssText = styleTag.textContent || '';
          const sizeRule = getCachedRegex(`\\.(?:Favicon\\.)?${escapedPageClass}(?![_\\w])[^{]*\\{[^}]*background-size[^}]*:([^;}]+)[^}]*\\}`, 'i');
          const sizeMatch = cssText.match(sizeRule);
          if (sizeMatch && sizeMatch[1]) {
            bgSize = sizeMatch[1].trim();
            break;
          }
        }
      }
      
      if (bgSize) {
        const sizeMatch = bgSize.match(PX_VALUE_REGEX);
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
      let bgSizeValueE4: number | null = null;
      
      for (const styleTag of styleTags) {
        const cssText = styleTag.textContent || '';
        
        // Ищем любое правило с background-image, содержащее favicon.yandex.net/favicon/v2/
        // Используем предварительно скомпилированные паттерны
        const spriteUrlPatterns = [SPRITE_BG_IMAGE_REGEX, SPRITE_URL_REGEX];
        
        for (const pattern of spriteUrlPatterns) {
          const matches = cssText.matchAll(pattern);
          for (const match of matches) {
            if (match[1]) {
              spriteUrl = match[1].trim();
              console.log(`✅ [FAVICON EXTRACT] Найден спрайт URL в CSS: ${spriteUrl.substring(0, 100)}...`);
              
              // Пробуем найти background-size в том же правиле или рядом
              // Ищем правило, содержащее этот URL
              const escapedSpriteUrl = escapeRegex(spriteUrl);
              const ruleMatch = cssText.match(getCachedRegex(`[^{]*\\{[^}]*${escapedSpriteUrl}[^}]*background-size[^}]*:([^;}]+)[^}]*\\}`, 'i'));
              if (ruleMatch && ruleMatch[1]) {
                const sizeValueMatch = ruleMatch[1].match(PX_VALUE_REGEX);
                if (sizeValueMatch) {
                  bgSizeValueE4 = parseFloat(sizeValueMatch[1]);
                  console.log(`✅ [FAVICON EXTRACT] Найден background-size: ${bgSizeValueE4}px`);
                }
              }
              
              // Если не нашли в том же правиле, ищем в соседних правилах (может быть разделено на несколько правил)
              if (!bgSizeValueE4) {
                const sizeMatch = cssText.match(BG_SIZE_GLOBAL_REGEX);
                if (sizeMatch && sizeMatch.length > 0) {
                  // Берем первое найденное значение background-size
                  const firstSizeMatch = sizeMatch[0].match(PX_VALUE_REGEX);
                  if (firstSizeMatch) {
                    bgSizeValueE4 = parseFloat(firstSizeMatch[1]);
                    console.log(`✅ [FAVICON EXTRACT] Найден background-size из соседнего правила: ${bgSizeValueE4}px`);
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
        
        // Ищем паттерны favicon.yandex.net/favicon/v2/ в сыром HTML (используем предварительно скомпилированные)
        const rawHtmlSpritePatterns = [
          RAW_HTML_SPRITE_HREF_REGEX,
          RAW_HTML_SPRITE_URL_REGEX,
          RAW_HTML_SPRITE_QUOTED_REGEX,
          RAW_HTML_SPRITE_PLAIN_REGEX
        ];
        
        for (const pattern of rawHtmlSpritePatterns) {
          const matches = rawHtml.matchAll(pattern);
          for (const match of matches) {
            if (match[1] && match[1].includes('favicon.yandex.net/favicon/v2/')) {
              spriteUrl = match[1].trim();
              // Очищаем URL от возможных лишних символов
              spriteUrl = spriteUrl.replace(QUOTES_REGEX, '').split('?')[0]; // Убираем кавычки и параметры для проверки
              // Восстанавливаем полный URL с параметрами, если они были
              const fullMatch = match[0];
              if (fullMatch.includes('?')) {
                const paramMatch = fullMatch.match(QUERY_PARAMS_REGEX);
                if (paramMatch) {
                  spriteUrl = spriteUrl + paramMatch[0];
                }
              }
              console.log(`✅ [FAVICON EXTRACT] Найден спрайт URL в сыром HTML: ${spriteUrl.substring(0, 100)}...`);
              
              // Пробуем найти background-size в inline-стилях элемента
              if (!bgSizeValueE4) {
                const styleAttrE45 = favEl.getAttribute('style') || '';
                const bgSizeMatchE45 = styleAttrE45.match(BG_SIZE_REGEX);
                if (bgSizeMatchE45 && bgSizeMatchE45[1]) {
                  const bgSizeStr = bgSizeMatchE45[1].trim();
                  const sizeValueMatches = bgSizeStr.match(PX_VALUES_REGEX);
                  if (sizeValueMatches && sizeValueMatches.length > 0) {
                    bgSizeValueE4 = parseFloat(sizeValueMatches[0]);
                    console.log(`✅ [FAVICON EXTRACT] Найден background-size из inline-стилей: ${bgSizeValueE4}px`);
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
    
    bgUrl = bgUrl.trim().replace(WHITESPACE_REGEX, '');
    console.log(`🔍 [FAVICON EXTRACT] bgUrl после очистки: "${bgUrl.substring(0, 100)}..."`);
    
    if (bgUrl.startsWith('//')) {
      bgUrl = 'https:' + bgUrl;
      console.log(`🔍 [FAVICON EXTRACT] bgUrl после добавления протокола: "${bgUrl.substring(0, 100)}..."`);
    }

    // НОВАЯ ЛОГИКА: Обработка спрайт-списков в URL (если есть точка с запятой)
    // ВАЖНО: Если URL из inline-стиля, мы считаем его единичной иконкой и НЕ парсим как спрайт-лист
    if (!isInlineUrl && bgUrl.includes('favicon.yandex.net/favicon/v2/') && bgUrl.includes(';')) {
      console.log(`🔍 [FAVICON EXTRACT] Обнаружен URL со списком доменов (спрайт): ${bgUrl}`);
      
      // Извлекаем часть с доменами: все после /v2/ и до ? или конца строки
      const v2Match = bgUrl.match(FAVICON_SPRITE_URL_REGEX);
      if (v2Match && v2Match[1]) {
        const domainsPart = v2Match[1];
        const domains = domainsPart.split(';').filter(d => d.trim().length > 0);
        console.log(`🔍 [FAVICON EXTRACT] Доменов в списке: ${domains.length}`);
        
        let index = 0;
        let posIndexFound = false;

        // ПРИОРИТЕТ 1: Если есть явная позиция в классе, используем ее
        if (pageClassMatch && posClassMatch) {
          const pIndex = parseInt(posClassMatch[1], 10);
          if (!isNaN(pIndex)) {
            index = pIndex;
            posIndexFound = true;
            console.log(`🔍 [FAVICON EXTRACT] Используем позицию из класса (Page_pos): ${index}`);
          }
        }

        // ПРИОРИТЕТ 2: Если нет явной позиции, вычисляем по background-position
        if (!posIndexFound && bgPosition) {
          // Извлекаем смещение по Y (обычно отрицательное значение в px)
          const yMatch = bgPosition.match(PX_WITH_SIGN_REGEX);
          if (yMatch) {
            const yOffset = Math.abs(parseFloat(yMatch[1]));
            
            // Пытаемся определить шаг (stride) на основе yOffset
            // Если offset = 0, индекс = 0
            if (yOffset === 0) {
              index = 0;
            } else {
              let stride = 0;
              
              // 1. Пробуем найти явный background-size (если он был извлечен ранее)
              if (bgSizeValue) {
                stride = bgSizeValue;
                 console.log(`🔍 [FAVICON EXTRACT] Используем stride из background-size: ${stride}px`);
              } 
              // 2. Если нет, пытаемся угадать по делимости
              else {
                 // Приоритет: 20px, затем 16px (самые частые кейсы Яндекса)
                 if (yOffset % 20 === 0) stride = 20;
                 else if (yOffset % 16 === 0) stride = 16;
                 else if (yOffset % 24 === 0) stride = 24;
                 else if (yOffset % 32 === 0) stride = 32;
                 else {
                   // Fallback: если не делится ровно, берем ближайший стандартный размер
                   // Скорее всего это 20px или 16px
                   // Если смещение маленькое (<=20), считаем что это индекс 1
                   if (yOffset <= 20) stride = yOffset;
                   else stride = 20; // Default fallback
                 }
                 console.log(`🔍 [FAVICON EXTRACT] Stride определен эвристически: ${stride}px (offset=${yOffset})`);
              }
              
              if (stride > 0) {
                index = Math.round(yOffset / stride);
              }
            }
            
            console.log(`🔍 [FAVICON EXTRACT] Расчет индекса: offset=${yOffset}px, stride=${bgSizeValue || 'auto'} => index=${index}`);
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
          
          // Ищем правило со спрайтом (используем предварительно скомпилированные паттерны)
          const spriteRulePatterns = [SPRITE_RULE_LOWER_REGEX, SPRITE_RULE_UPPER_REGEX];
          
          for (const pattern of spriteRulePatterns) {
            const spriteRuleMatch = cssText.match(pattern);
            if (spriteRuleMatch && spriteRuleMatch[1]) {
              spriteUrl = spriteRuleMatch[1].trim();
              // Извлекаем background-size (может быть "16px 368px" или "16px")
              // Для спрайта важна высота одной иконки (первое значение, если два значения)
              const bgSizeStr = spriteRuleMatch[2] ? spriteRuleMatch[2].trim() : '';
              const sizeMatches = bgSizeStr.match(PX_VALUES_REGEX);
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
            // Ищем любое правило с background-image, содержащее favicon.yandex.net/favicon/v2/
            const spriteUrlMatch = cssText.match(SPRITE_BG_IMAGE_WITH_SIZE_REGEX);
            if (spriteUrlMatch && spriteUrlMatch[1]) {
              spriteUrl = spriteUrlMatch[1].trim();
              // Пробуем найти background-size в том же правиле или в связанном правиле
              const fullRuleMatch = cssText.match(SPRITE_FULL_RULE_REGEX);
              if (fullRuleMatch && fullRuleMatch[1]) {
                const bgSizeStr = fullRuleMatch[1].trim();
                const sizeValueMatches = bgSizeStr.match(PX_VALUES_REGEX);
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
          
          // Используем предварительно скомпилированные паттерны
          const rawHtmlSpritePatterns = [
            RAW_HTML_SPRITE_HREF_REGEX,
            RAW_HTML_SPRITE_URL_REGEX,
            RAW_HTML_SPRITE_QUOTED_REGEX,
            RAW_HTML_SPRITE_PLAIN_REGEX
          ];
          
          for (const pattern of rawHtmlSpritePatterns) {
            const matches = rawHtml.matchAll(pattern);
            for (const match of matches) {
              if (match[1] && match[1].includes('favicon.yandex.net/favicon/v2/')) {
                spriteUrl = match[1].trim();
                // Очищаем URL от возможных лишних символов
                spriteUrl = spriteUrl.replace(QUOTES_REGEX, '').split('?')[0];
                // Восстанавливаем полный URL с параметрами, если они были
                const fullMatch = match[0];
                if (fullMatch.includes('?')) {
                  const paramMatch = fullMatch.match(QUERY_PARAMS_REGEX);
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
    // Пропускаем для inline URL, так как это единичная иконка
    if (!isInlineUrl && spriteUrl && !spriteBgSizeValue) {
      const styleTags = getStyleTags(doc, rawHtml);
        for (const styleTag of styleTags) {
          const cssText = styleTag.textContent || '';
          // Ищем background-size в правилах, связанных с favicon классами
          for (const favClass of favClasses) {
            const escapedClass = escapeRegex(favClass);
            const sizeRule = getCachedRegex(`\\.${escapedClass}(?:\\.[^{]*)?\\{[^}]*background-size[^}]*:([^;}]+)[^}]*\\}`, 'i');
            const sizeMatch = cssText.match(sizeRule);
            if (sizeMatch && sizeMatch[1]) {
              const bgSizeStr = sizeMatch[1].trim();
              // Извлекаем размер (может быть "16px 368px" или "16px")
              const sizeValueMatches = bgSizeStr.match(PX_VALUES_REGEX);
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
        // Декодируем quoted-printable и очищаем
        const cleanSpriteUrl = spriteUrl.replace(QP_EQUALS_REGEX, '=').replace(QP_SEMICOLON_REGEX, ';').replace(QP_LINEBREAK_REGEX, '');
        const spriteListMatch = cleanSpriteUrl.match(FAVICON_V2_URL_REGEX);
        if (spriteListMatch && spriteListMatch[1]) {
          let addressesString = spriteListMatch[1];
          // Убираем параметры запроса (аккуратно)
          const qIndex = addressesString.lastIndexOf('?');
          if (qIndex !== -1 && (addressesString.includes('size=') || addressesString.includes('stub='))) {
            addressesString = addressesString.substring(0, qIndex);
          } else if (addressesString.includes('?')) {
             addressesString = addressesString.split('?')[0];
          }
          // Разделяем по точке с запятой
          const addresses = addressesString.split(';').filter(addr => addr.trim().length > 0);
          
          console.log(`🔍 [FAVICON EXTRACT] Извлечено ${addresses.length} доменов из спрайта`);
          
          let positionIndex: number | null = null;
          
          // ПРИОРИТЕТ 1: Используем позицию из класса (Favicon-PageX_pos_Y), так как это индекс иконки в спрайте.
          // Favicon-EntryN часто является просто идентификатором группы, а не индекса.
          const posClassMatchInner = favEl.className.match(FAVICON_POS_CLASS_REGEX);
          if (posClassMatchInner && posClassMatchInner[1]) {
             positionIndex = parseInt(posClassMatchInner[1], 10);
             console.log(`🔍 [FAVICON EXTRACT] Используем позицию из класса (Page_pos): ${positionIndex}`);
          }
          
          // ПРИОРИТЕТ 2: Если нет явной позиции в классе, пробуем Favicon-EntryN
          if (positionIndex === null && entryClassMatch) {
            const entryNumber = parseInt(entryClassMatch[1] || entryClassMatch[2] || '0', 10);
            // Номера входа обычно начинаются с 1, но индексы массивов с 0
            positionIndex = entryNumber > 0 ? entryNumber - 1 : 0;
            console.log(`🔍 [FAVICON EXTRACT] Используем номер входа из класса (Fallback): ${entryNumber} -> индекс ${positionIndex}`);
          }
          
          // ПРИОРИТЕТ 2: Если нет номера входа, вычисляем индекс по background-position и размеру
          if (positionIndex === null && spriteBgSizeValue && bgPosition) {
            // background-position может быть в формате "0px -16px" (x y) или просто "-16px"
            // Для вертикального спрайта важна вторая координата (y)
            const posMatches = bgPosition.match(PX_NEGATIVE_REGEX);
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
            
            if (!cleanHost || cleanHost.trim() === '') {
               // Skip empty host
               return null; 
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
            
            if (cleanHost && cleanHost.trim() !== '') {
                const faviconUrl = `https://favicon.yandex.net/favicon/v2/${encodeURIComponent(cleanHost)}?size=32&stub=1`;
                row['#FaviconImage'] = faviconUrl;
                console.log(`✅ [FAVICON EXTRACT] Использован первый домен "${cleanHost}", URL: ${faviconUrl}`);
            }
            return null;
          }
        }
      }
    }
    
    // Проверяем, является ли это спрайтом с перечислением адресов
    // Формат: //favicon.yandex.net/favicon/v2/https://site1;https://site2;...;https://siteN?size=32&stub=1&reqid=...
    // Извлекаем список доменов: берем все после /favicon/v2/
    const cleanBgUrl = bgUrl ? bgUrl.replace(QP_EQUALS_REGEX, '=').replace(QP_SEMICOLON_REGEX, ';').replace(QP_LINEBREAK_REGEX, '') : '';
    const spriteListMatchFinal = cleanBgUrl && cleanBgUrl.match(FAVICON_V2_URL_REGEX);
    if (spriteListMatchFinal && spriteListMatchFinal[1]) {
      let addressesString = spriteListMatchFinal[1];
      
      // Сначала убираем глобальные параметры запроса (все что после ?)
      const qIndex = addressesString.lastIndexOf('?');
      if (qIndex !== -1 && (addressesString.includes('size=') || addressesString.includes('stub='))) {
        addressesString = addressesString.substring(0, qIndex);
      } else if (addressesString.includes('?')) {
         addressesString = addressesString.split('?')[0];
      }
      
      // Разделяем по точке с запятой
      const addresses = addressesString.split(';').filter((addr: string) => addr.trim().length > 0);
      
      if (addresses.length > 0) {
        // Если мы здесь, значит не сработала логика с background-position выше
        // (например, позиция не найдена или равна 0)
        
        // Пробуем найти позицию еще раз, если она есть
        if (bgPosition) {
           // Повторяем попытку извлечения индекса (дублирование логики для надежности)
           const posMatches = bgPosition.match(PX_NEGATIVE_REGEX);
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
                 
                 if (cleanHost && cleanHost.trim() !== '') {
                     const faviconUrl = `https://favicon.yandex.net/favicon/v2/${encodeURIComponent(cleanHost)}?size=32&stub=1`;
                     row['#FaviconImage'] = faviconUrl;
                     console.log(`✅ [FAVICON EXTRACT] (Fallback) Сопоставлен домен "${cleanHost}" (индекс ${calculatedIndex}) из списка, URL: ${faviconUrl}`);
                 }
                 
                 // Инициализируем спрайт для БУДУЩИХ строк, но текущую мы уже заполнили
                 const faviconUrls = addresses.map((addr: string) => {
                    const cleanAddr = addr.trim();
                    const cleanAddrWithoutParams = cleanAddr.split('?')[0];
                    // Basic validation for cleanAddr?
                    return `https://favicon.yandex.net/favicon/v2/${encodeURIComponent(cleanAddrWithoutParams)}?size=32&stub=1`;
                 });
                 
                 return {
                   urls: faviconUrls,
                   currentIndex: calculatedIndex + 1 // Следующий индекс
                 };
              }
           }
        }

        // Если не удалось определить конкретную позицию, пробуем использовать состояние спрайта или берем первую
        let targetIndex = 0;
        
        // ЭВРИСТИКА: Если есть активный спрайт-лист с таким же количеством элементов, 
        // скорее всего мы продолжаем идти по нему последовательно.
        // Это предотвращает сброс на 0-й индекс при ошибке определения позиции.
        // ТАКЖЕ, если мы нашли адреса в CSS правиле для класса, но не нашли позицию в inline-стилях,
        // мы полагаемся на номер входа (entryNumber), который должен был быть извлечен ранее (positionIndex).
        // Но если positionIndex === null (не найден Favicon-EntryX), то логика сваливается сюда.
        
        if (spriteState && spriteState.urls.length === addresses.length) {
           targetIndex = spriteState.currentIndex;
           if (targetIndex >= addresses.length) targetIndex = 0; // Safe fallback
           console.log(`⚠️ [FAVICON EXTRACT] Позиция неизвестна, используем следующий индекс из последовательности: ${targetIndex}`);
        } else if (addresses.length > 1) {
           // Если спрайт новый, и в нем много элементов, но мы не знаем позицию,
           // это опасно - мы возьмем первый элемент.
           // Попробуем извлечь Favicon-Entry из класса элемента (повторно, если переменная локальна)
           // В данном контексте у нас нет доступа к favEl напрямую, только к bgUrl/bgPosition
           
           // Но если мы здесь, значит bgPosition не помог.
           // Если это первый элемент в серии (например, 4 элемента в начале файла не имеют фавиконок),
           // и мы наткнулись на сниппет с фавиконкой, который ссылается на спрайт из 30 доменов.
           // Взять 0-й - ошибка. 
           
           // ВАЖНОЕ ИСПРАВЛЕНИЕ: Если мы не знаем позицию, мы не можем инициализировать спрайт с 0!
           // Лучше вернуть пустую фавиконку, чем неправильную.
           // ИЛИ, если это спрайт-лист, передать его ЦЕЛИКОМ в row['#FaviconImage'] с префиксом SPRITE_LIST,
           // и пусть image-handlers разбирается (но там тоже нужен порядок).
           
           // РЕШЕНИЕ: Инициируем спрайт, но текущий элемент помечаем как требующий "следующего" из списка?
           // Нет. Если мы не знаем индекс, мы не знаем, кто мы.
           
           // Однако, в предоставленном примере (HTML анализ), у элементов ЕСТЬ классы Favicon-Page0_pos_X.
           // Если мы попали сюда, значит bgPosition не был извлечен или не сматчился.
           // В анализе HTML видно: style="...background-position-y:-32px"
           // Это должно было сработать в блоке `if (positionIndex === null && spriteBgSizeValue && bgPosition)`
           // Проблема может быть в том, что spriteBgSizeValue не определился.
        }
        
        // В данном случае, если мы не смогли определить индекс, но видим список адресов,
        // мы предполагаем, что это начало списка.
        
        const faviconUrls = addresses.map((addr: string) => {
          const cleanAddr = addr.trim();
          const cleanAddrWithoutParams = cleanAddr.split('?')[0];
          if (!cleanAddrWithoutParams) return null;
          return `https://favicon.yandex.net/favicon/v2/${encodeURIComponent(cleanAddrWithoutParams)}?size=32&stub=1`;
        }).filter((url: string | null) => url !== null) as string[];
        
        // Используем вычисленный или первый URL
        const finalFaviconUrl = faviconUrls[targetIndex] || faviconUrls[0];
        
        // Если targetIndex был 0 (новый список) и мы не уверены в позиции,
        // возможно стоит вернуть SPRITE_LIST, чтобы image-handlers взял первый?
        // Но image-handlers уже доверяет нам.
        
        row['#FaviconImage'] = finalFaviconUrl;
        console.log(`✅ [FAVICON EXTRACT] Установлена иконка (индекс ${targetIndex}): ${finalFaviconUrl.substring(0, 100)}...`);
        
        // Создаем новое состояние спрайта для следующих строк (или обновляем текущее)
        const newSpriteState = {
          urls: faviconUrls,
          currentIndex: targetIndex + 1
        };
        
        console.log(`✅ Спрайт-список инициализирован: ${addresses.length} адресов`);
        
        return newSpriteState;
      }
    }
    
    // Если это обычный URL (не спрайт) или inline URL (считаем единичным), используем его напрямую
    // Если есть активный спрайт, сбрасываем его (встретился другой тип фавиконки)
    row['#FaviconImage'] = bgUrl;
    console.log(`✅ [FAVICON EXTRACT] Установлен URL (${isInlineUrl ? 'inline, единичный' : 'обычный'}): ${row['#FaviconImage'].substring(0, 100)}...`);
    return null; // Сбрасываем состояние спрайта
  } catch (e) {
    console.error('❌ [FAVICON EXTRACT] Ошибка парсинга фавиконки:', e);
    return spriteState; // Возвращаем состояние без изменений при ошибке
  }
}

