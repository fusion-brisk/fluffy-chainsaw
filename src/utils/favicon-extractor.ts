// Favicon extraction utilities - Chain of Responsibility pattern

import { CSVRow } from '../types';
import {
  BG_IMAGE_URL_REGEX,
  BG_POSITION_REGEX,
  BG_SIZE_REGEX,
  BG_SIZE_GLOBAL_REGEX,
  PX_VALUE_REGEX,
  PX_VALUES_REGEX,
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

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface SpriteState {
  urls: string[];
  currentIndex: number;
}

/** Контекст для извлечения фавиконки */
export interface FaviconContext {
  container: Element;
  doc: Document;
  row: CSVRow;
  spriteState: SpriteState | null;
  rawHtml?: string;
  favEl: HTMLElement;
  favClasses: string[];
  snippetTitle: string;
}

/** Результат работы экстрактора */
export interface ExtractorResult {
  found: boolean;
  bgUrl: string | null;
  bgPosition: string | null;
  bgSizeValue: number | null;
  isInlineUrl: boolean;
  newSpriteState: SpriteState | null;
}

/** Интерфейс экстрактора фавиконок */
interface FaviconExtractor {
  name: string;
  extract(ctx: FaviconContext, prevResult: ExtractorResult): ExtractorResult;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/** Создает пустой результат */
function createEmptyResult(spriteState: SpriteState | null): ExtractorResult {
  return {
    found: false,
    bgUrl: null,
    bgPosition: null,
    bgSizeValue: null,
    isInlineUrl: false,
    newSpriteState: spriteState
  };
}

/** Декодирует HTML-сущности */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(HTML_AMP_REGEX, '&')
    .replace(HTML_LT_REGEX, '<')
    .replace(HTML_GT_REGEX, '>')
    .replace(HTML_QUOT_REGEX, '"');
}

/** Нормализует URL (добавляет протокол, убирает пробелы) */
function normalizeUrl(url: string): string {
  let result = url.trim().replace(WHITESPACE_REGEX, '');
  if (result.startsWith('//')) {
    result = 'https:' + result;
  }
  return result;
}

/** Извлекает домен по индексу из спрайт-URL */
function extractDomainFromSprite(
  spriteUrl: string,
  index: number,
  bgSizeValue: number | null
): { url: string; domains: string[] } | null {
  const v2Match = spriteUrl.match(FAVICON_SPRITE_URL_REGEX);
  if (!v2Match || !v2Match[1]) return null;

  const domainsPart = v2Match[1];
  const domains = domainsPart.split(';').filter(d => d.trim().length > 0);
  
  if (domains.length === 0) return null;
  
  const targetIndex = Math.min(Math.max(0, index), domains.length - 1);
  const domain = domains[targetIndex];
  const cleanDomain = domain.replace(/^https?:\/\//i, '').split('?')[0].split('/')[0];
  
  return {
    url: `https://favicon.yandex.net/favicon/v2/${encodeURIComponent(cleanDomain)}?size=32&stub=1`,
    domains
  };
}

/** Вычисляет индекс иконки по background-position */
function calculateIndexFromPosition(
  bgPosition: string,
  bgSizeValue: number | null
): number {
  // background-position может быть:
  // - "-20px" (только Y)
  // - "0px -20px" (X Y)
  // - "0 -20px" (X Y без px для X)
  // Нам нужно значение Y (вертикальное смещение)
  
  // Находим все значения в px
  const allPxValues = bgPosition.match(PX_NEGATIVE_REGEX);
  
  let yOffset = 0;
  
  if (allPxValues && allPxValues.length > 0) {
    if (allPxValues.length === 1) {
      // Одно значение — это Y (для background-position-y)
      yOffset = Math.abs(parseFloat(allPxValues[0]));
    } else {
      // Два значения — второе это Y
      yOffset = Math.abs(parseFloat(allPxValues[1]));
    }
  }
  
  if (yOffset === 0) return 0;

  let stride = bgSizeValue || 0;
  
  // Эвристическое определение stride если не задан
  if (!stride) {
    if (yOffset % 20 === 0) stride = 20;
    else if (yOffset % 16 === 0) stride = 16;
    else if (yOffset % 24 === 0) stride = 24;
    else if (yOffset % 32 === 0) stride = 32;
    else stride = yOffset <= 20 ? yOffset : 20;
  }

  return stride > 0 ? Math.round(yOffset / stride) : 0;
}

// ============================================================================
// EXTRACTORS
// ============================================================================

/**
 * Экстрактор 1: Inline-стили (background-image в style атрибуте)
 * Приоритетный способ для MHTML файлов
 */
const InlineStyleExtractor: FaviconExtractor = {
  name: 'InlineStyleExtractor',
  
  extract(ctx: FaviconContext, prevResult: ExtractorResult): ExtractorResult {
    const styleAttr = ctx.favEl.getAttribute('style') || '';
    if (!styleAttr) return prevResult;

    console.log(`🔍 [${this.name}] Проверка inline-стилей: "${styleAttr.substring(0, 100)}..."`);

    const result = { ...prevResult };
    
    // Извлекаем background-image
    const bgMatch = styleAttr.match(BG_IMAGE_URL_REGEX);
    if (bgMatch && bgMatch[1]) {
      let bgUrl = bgMatch[1].trim();
      bgUrl = decodeHtmlEntities(bgUrl);
      bgUrl = bgUrl.replace(EDGE_QUOTES_REGEX, '');
      
      result.bgUrl = bgUrl;
      result.isInlineUrl = true;
      result.found = true;
      console.log(`✅ [${this.name}] Найден URL: ${bgUrl.substring(0, 80)}...`);
    }

    // Извлекаем background-position
    const posMatch = styleAttr.match(BG_POSITION_REGEX);
    if (posMatch && posMatch[1]) {
      result.bgPosition = posMatch[1].trim();
      console.log(`🔍 [${this.name}] Найден background-position: "${result.bgPosition}"`);
    }

    // Извлекаем background-size
    const sizeMatch = styleAttr.match(BG_SIZE_REGEX);
    if (sizeMatch && sizeMatch[1]) {
      const sizeValues = sizeMatch[1].trim().match(PX_VALUES_REGEX);
      if (sizeValues && sizeValues.length > 0) {
        result.bgSizeValue = parseFloat(sizeValues[0]);
        console.log(`🔍 [${this.name}] Найден background-size: ${result.bgSizeValue}px`);
      }
    }

    return result;
  }
};

/**
 * Экстрактор 2: CSS классы спрайтов (Favicon-PageX, Favicon-EntryX)
 * Работает с CSS-спрайтами Яндекса
 */
const SpriteClassExtractor: FaviconExtractor = {
  name: 'SpriteClassExtractor',

  extract(ctx: FaviconContext, prevResult: ExtractorResult): ExtractorResult {
    // Пропускаем, если уже нашли inline URL
    if (prevResult.isInlineUrl && prevResult.bgUrl) {
      return prevResult;
    }

    const pageClassMatch = ctx.favEl.className.match(FAVICON_PAGE_CLASS_REGEX);
    const posClassMatch = ctx.favEl.className.match(FAVICON_POS_CLASS_REGEX);
    const entryClassMatch = ctx.favEl.className.match(FAVICON_ENTRY_CLASS_REGEX);

    if (!pageClassMatch) {
      return prevResult;
    }

    const result = { ...prevResult };
    const pageNumber = pageClassMatch[1] || pageClassMatch[2] || '0';
    const pageClassLower = `favicon_page_${pageNumber}`;
    const pageClassUpper = `Favicon-Page${pageNumber}`;
    const escapedPageClassLower = escapeRegex(pageClassLower);
    const escapedPageClassUpper = escapeRegex(pageClassUpper);

    console.log(`🔍 [${this.name}] Найден класс страницы: ${pageClassUpper}`);

    const styleTags = getStyleTags(ctx.doc, ctx.rawHtml);

    for (const styleTag of styleTags) {
      const cssText = styleTag.textContent || '';

      // ПРИОРИТЕТ 1: Комбинация page + entry классов
      if (entryClassMatch && !result.bgUrl) {
        const entryNumber = entryClassMatch[1] || entryClassMatch[2] || '1';
        const entryClassLower = `favicon_entry_${entryNumber}`;
        const entryClassUpper = `Favicon-Entry${entryNumber}`;
        const escapedEntryLower = escapeRegex(entryClassLower);
        const escapedEntryUpper = escapeRegex(entryClassUpper);

        const combinedPatterns = [
          getCachedRegex(`\\.${escapedPageClassLower}\\.${escapedEntryLower}(?:\\s+\\.[^{]*)?\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*background-size[^}]*:([^;}]+)[^}]*\\}`, 'i'),
          getCachedRegex(`\\.${escapedPageClassUpper}\\.${escapedEntryUpper}(?:\\.[^{]*)?\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*background-size[^}]*:([^;}]+)[^}]*\\}`, 'i')
        ];

        for (const pattern of combinedPatterns) {
          const match = cssText.match(pattern);
          if (match && match[1]) {
            result.bgUrl = match[1].replace(QUOTES_REGEX, '').trim();
            result.found = true;
            
            const bgSizeStr = match[2] ? match[2].trim() : '';
            const sizeMatches = bgSizeStr.match(PX_VALUES_REGEX);
            if (sizeMatches && sizeMatches.length > 0) {
              result.bgSizeValue = parseFloat(sizeMatches[0]);
            }
            
            console.log(`✅ [${this.name}] Найден URL спрайта из комбинации классов: ${result.bgUrl.substring(0, 80)}..., size: ${result.bgSizeValue || 'n/a'}px`);
            break;
          }
        }
      }

      // ПРИОРИТЕТ 2: Только page класс
      if (!result.bgUrl) {
        const basePagePatterns = [
          getCachedRegex(`\\.${escapedPageClassLower}(?![_\\w-])[^{]*\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*\\}`, 'i'),
          getCachedRegex(`\\.${escapedPageClassUpper}(?![_\\w-])[^{]*\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*\\}`, 'i'),
          getCachedRegex(`\\.Favicon\\.${escapedPageClassUpper}(?![_\\w-])[^{]*\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*\\}`, 'i'),
          getCachedRegex(`\\.${escapedPageClassUpper}\\.Favicon[^{]*\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*\\}`, 'i'),
          getCachedRegex(`\\.${escapedPageClassUpper}\\.[^{]*\\{[^}]*background-image[^}]*url\\s*\\(\\s*["']?([^"')]+)["']?\\s*\\)[^}]*\\}`, 'i')
        ];

        for (const pattern of basePagePatterns) {
          const match = cssText.match(pattern);
          if (match && match[1]) {
            result.bgUrl = match[1].replace(QUOTES_REGEX, '').trim();
            result.found = true;
            console.log(`✅ [${this.name}] Найден URL спрайта из класса ${pageClassUpper}: ${result.bgUrl.substring(0, 80)}...`);
            break;
          }
        }
      }

      // Извлекаем background-position из класса позиции
      if (result.bgUrl && posClassMatch && !result.bgPosition) {
        const posClass = `Favicon-Page${posClassMatch[1]}_pos_${posClassMatch[1]}`;
        const escapedPosClass = escapeRegex(posClass);

        const posPatterns = [
          getCachedRegex(`\\.${escapedPosClass}(?![_\\w-])[^{]*\\{[^}]*background-position[^}]*:([^;}]+)[^}]*\\}`, 'i'),
          getCachedRegex(`\\.Favicon\\.${escapedPosClass}(?![_\\w-])[^{]*\\{[^}]*background-position[^}]*:([^;}]+)[^}]*\\}`, 'i'),
          getCachedRegex(`\\.${escapedPosClass}\\.[^{]*\\{[^}]*background-position[^}]*:([^;}]+)[^}]*\\}`, 'i')
        ];

        for (const posPattern of posPatterns) {
          const posMatch = cssText.match(posPattern);
          if (posMatch && posMatch[1]) {
            result.bgPosition = posMatch[1].trim();
            console.log(`✅ [${this.name}] Найдена позиция из класса ${posClass}: ${result.bgPosition}`);
            break;
          }
        }
      }

      if (result.bgUrl) break;
    }

    return result;
  }
};

/**
 * Экстрактор 3: CSS правила по классам элемента
 * Ищет background-image в CSS по классам Favicon элемента
 */
const CssRuleExtractor: FaviconExtractor = {
  name: 'CssRuleExtractor',

  extract(ctx: FaviconContext, prevResult: ExtractorResult): ExtractorResult {
    // Пропускаем, если уже нашли URL
    if (prevResult.bgUrl) {
      // Но можем искать background-position, если его нет
      if (prevResult.bgPosition || prevResult.isInlineUrl) {
        return prevResult;
      }
    }

    const result = { ...prevResult };
    const styleTags = getStyleTags(ctx.doc, ctx.rawHtml);

    console.log(`🔍 [${this.name}] Поиск в CSS по ${ctx.favClasses.length} классам элемента (${styleTags.length} style тегов)`);

    for (const styleTag of styleTags) {
      const cssText = styleTag.textContent || '';

      // Поиск background-position для каждого класса (если URL inline и position не найден)
      if (!result.bgPosition && prevResult.isInlineUrl) {
        for (const favClass of ctx.favClasses) {
          const escapedClass = escapeRegex(favClass);
          const posRule = getCachedRegex(`\\.${escapedClass}(?:\\.[^{]*)?\\{[^}]*background-position(?:-y)?[^}]*:([^;}]+)[^}]*\\}`, 'i');
          const posMatch = cssText.match(posRule);
          if (posMatch && posMatch[1]) {
            result.bgPosition = posMatch[1].trim();
            console.log(`✅ [${this.name}] Найден background-position для класса "${favClass}": "${result.bgPosition}"`);
            break;
          }
        }
      }

      // Поиск background-image (если URL еще не найден)
      if (!result.bgUrl) {
        // По комбинации всех классов
        if (ctx.favClasses.length > 0) {
          const allClassesEscaped = ctx.favClasses.map(c => escapeRegex(c)).join('\\.');
          const combinedRule = getCachedRegex(`\\.${allClassesEscaped}[^{]*\\{[^}]*background-image[^}]*url\\(([^)]+)\\)[^}]*\\}`, 'i');
          const combinedMatch = cssText.match(combinedRule);
          if (combinedMatch && combinedMatch[1]) {
            result.bgUrl = combinedMatch[1].replace(QUOTES_REGEX, '').trim();
            result.found = true;
            console.log(`✅ [${this.name}] Найден bgUrl по комбинации классов: ${result.bgUrl.substring(0, 80)}...`);
            break;
          }
        }

        // По отдельным классам
        for (const favClass of ctx.favClasses) {
          const escapedClass = escapeRegex(favClass);
          const cssRule = getCachedRegex(`\\.${escapedClass}(?:\\.[^{]*)?\\{[^}]*background-image[^}]*url\\(([^)]+)\\)[^}]*\\}`, 'i');
          const match = cssText.match(cssRule);
          if (match && match[1]) {
            result.bgUrl = match[1].replace(QUOTES_REGEX, '').trim();
            result.found = true;
            console.log(`✅ [${this.name}] Найден bgUrl по классу "${favClass}": ${result.bgUrl.substring(0, 80)}...`);
            break;
          }
        }
      }

      if (result.bgUrl && result.bgPosition) break;
    }

    // Диагностика если не нашли
    if (!result.bgUrl) {
      console.log(`⚠️ [${this.name}] Не найдено bgUrl по классам. Ищем все упоминания favicon в CSS...`);
      for (const styleTag of styleTags) {
        const cssText = styleTag.textContent || '';
        const faviconRules = cssText.match(FAVICON_CSS_RULES_REGEX);
        if (faviconRules && faviconRules.length > 0) {
          console.log(`🔍 [${this.name}] Найдено ${faviconRules.length} CSS правил с favicon`);
        }
        const spriteRules = cssText.match(FAVICON_YANDEX_CSS_RULES_REGEX);
        if (spriteRules && spriteRules.length > 0) {
          console.log(`🔍 [${this.name}] Найдено ${spriteRules.length} CSS правил с favicon.yandex.net`);
        }
      }
    }

    return result;
  }
};

/**
 * Экстрактор 4: Поиск спрайтов в CSS/HTML при наличии background-position
 * Когда есть позиция, но нет URL — ищем спрайт везде
 */
const RawHtmlExtractor: FaviconExtractor = {
  name: 'RawHtmlExtractor',

  extract(ctx: FaviconContext, prevResult: ExtractorResult): ExtractorResult {
    // Запускается только если есть position, но нет URL
    if (prevResult.bgUrl || !prevResult.bgPosition) {
      return prevResult;
    }

    const result = { ...prevResult };
    console.log(`🔍 [${this.name}] bgUrl пустой, но есть bgPosition="${result.bgPosition}", ищем спрайт...`);

    const styleTags = getStyleTags(ctx.doc, ctx.rawHtml);
    let spriteUrl: string | null = null;
    let bgSizeValue: number | null = result.bgSizeValue;

    // Поиск в CSS
    for (const styleTag of styleTags) {
      const cssText = styleTag.textContent || '';

      const spriteUrlPatterns = [SPRITE_BG_IMAGE_REGEX, SPRITE_URL_REGEX];
      
      for (const pattern of spriteUrlPatterns) {
        const matches = cssText.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) {
            spriteUrl = match[1].trim();
            console.log(`✅ [${this.name}] Найден спрайт URL в CSS: ${spriteUrl.substring(0, 100)}...`);

            // Ищем background-size в том же правиле
            const escapedSpriteUrl = escapeRegex(spriteUrl);
            const ruleMatch = cssText.match(getCachedRegex(`[^{]*\\{[^}]*${escapedSpriteUrl}[^}]*background-size[^}]*:([^;}]+)[^}]*\\}`, 'i'));
            if (ruleMatch && ruleMatch[1]) {
              const sizeValueMatch = ruleMatch[1].match(PX_VALUE_REGEX);
              if (sizeValueMatch) {
                bgSizeValue = parseFloat(sizeValueMatch[1]);
                console.log(`✅ [${this.name}] Найден background-size: ${bgSizeValue}px`);
              }
            }

            // Fallback: ищем background-size в соседних правилах
            if (!bgSizeValue) {
              const sizeMatch = cssText.match(BG_SIZE_GLOBAL_REGEX);
              if (sizeMatch && sizeMatch.length > 0) {
                const firstSizeMatch = sizeMatch[0].match(PX_VALUE_REGEX);
                if (firstSizeMatch) {
                  bgSizeValue = parseFloat(firstSizeMatch[1]);
                  console.log(`✅ [${this.name}] Найден background-size из соседнего правила: ${bgSizeValue}px`);
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

    // Поиск в сыром HTML (если не нашли в CSS)
    if (!spriteUrl && ctx.rawHtml) {
      console.log(`🔍 [${this.name}] Не найдено в CSS, ищем спрайт в сыром HTML...`);

      const rawHtmlPatterns = [
        RAW_HTML_SPRITE_HREF_REGEX,
        RAW_HTML_SPRITE_URL_REGEX,
        RAW_HTML_SPRITE_QUOTED_REGEX,
        RAW_HTML_SPRITE_PLAIN_REGEX
      ];

      for (const pattern of rawHtmlPatterns) {
        const matches = ctx.rawHtml.matchAll(pattern);
        for (const match of matches) {
          if (match[1] && match[1].includes('favicon.yandex.net/favicon/v2/')) {
            spriteUrl = match[1].trim();
            spriteUrl = spriteUrl.replace(QUOTES_REGEX, '').split('?')[0];
            
            // Восстанавливаем параметры
            const fullMatch = match[0];
            if (fullMatch.includes('?')) {
              const paramMatch = fullMatch.match(QUERY_PARAMS_REGEX);
              if (paramMatch) {
                spriteUrl = spriteUrl + paramMatch[0];
              }
            }
            console.log(`✅ [${this.name}] Найден спрайт URL в сыром HTML: ${spriteUrl.substring(0, 100)}...`);

            // Пробуем найти background-size в inline-стилях
            if (!bgSizeValue) {
              const styleAttr = ctx.favEl.getAttribute('style') || '';
              const bgSizeMatch = styleAttr.match(BG_SIZE_REGEX);
              if (bgSizeMatch && bgSizeMatch[1]) {
                const sizeValues = bgSizeMatch[1].trim().match(PX_VALUES_REGEX);
                if (sizeValues && sizeValues.length > 0) {
                  bgSizeValue = parseFloat(sizeValues[0]);
                  console.log(`✅ [${this.name}] Найден background-size из inline-стилей: ${bgSizeValue}px`);
                }
              }
            }
            break;
          }
        }
        if (spriteUrl) break;
      }
    }

    if (spriteUrl && spriteUrl.includes('favicon.yandex.net/favicon/v2/')) {
      result.bgUrl = spriteUrl;
      result.bgSizeValue = bgSizeValue;
      result.found = true;
      console.log(`✅ [${this.name}] Установлен bgUrl из спрайта: ${result.bgUrl.substring(0, 100)}...`);
    }

    return result;
  }
};

/**
 * Экстрактор 5: Fallback на img src
 * Последняя попытка — ищем img внутри favicon элемента
 */
const ImgSrcExtractor: FaviconExtractor = {
  name: 'ImgSrcExtractor',

  extract(ctx: FaviconContext, prevResult: ExtractorResult): ExtractorResult {
    if (prevResult.bgUrl) {
      return prevResult;
    }

    const result = { ...prevResult };
    const imgEl = ctx.favEl.querySelector('img') as HTMLImageElement | null;
    
    if (imgEl && imgEl.src) {
      result.bgUrl = imgEl.src;
      result.found = true;
      console.log(`✅ [${this.name}] Найден bgUrl из img src: ${result.bgUrl.substring(0, 80)}...`);
    }

    return result;
  }
};

// ============================================================================
// CHAIN OF RESPONSIBILITY
// ============================================================================

/** Цепочка экстракторов в порядке приоритета */
const extractorChain: FaviconExtractor[] = [
  InlineStyleExtractor,
  SpriteClassExtractor,
  CssRuleExtractor,
  RawHtmlExtractor,
  ImgSrcExtractor
];

/**
 * Обрабатывает спрайт-URL с перечислением доменов
 * Извлекает конкретный домен по позиции (background-position или класс)
 * 
 * ВАЖНО: Индекс определяется ТОЛЬКО по данным конкретного сниппета,
 * НЕ по последовательному счетчику.
 */
function processSpriteUrl(
  bgUrl: string,
  bgPosition: string | null,
  bgSizeValue: number | null,
  favEl: HTMLElement,
  isInlineUrl: boolean,
  _spriteState: SpriteState | null // Не используется для индексации
): { faviconUrl: string | null; newSpriteState: SpriteState | null } {
  // Пропускаем обработку спрайта для inline URL (считаем единичной иконкой)
  if (isInlineUrl) {
    return { faviconUrl: bgUrl, newSpriteState: null };
  }

  // Проверяем, содержит ли URL список доменов (точка с запятой)
  if (!bgUrl.includes('favicon.yandex.net/favicon/v2/') || !bgUrl.includes(';')) {
    return { faviconUrl: bgUrl, newSpriteState: null };
  }

  console.log(`🔍 [processSpriteUrl] Обнаружен URL со списком доменов (спрайт): ${bgUrl.substring(0, 100)}...`);

  // Извлекаем часть с доменами
  const v2Match = bgUrl.match(FAVICON_SPRITE_URL_REGEX);
  if (!v2Match || !v2Match[1]) {
    return { faviconUrl: bgUrl, newSpriteState: null };
  }

  const domainsPart = v2Match[1];
  const domains = domainsPart.split(';').filter(d => d.trim().length > 0);
  console.log(`🔍 [processSpriteUrl] Доменов в списке: ${domains.length}`);

  if (domains.length === 0) {
    return { faviconUrl: bgUrl, newSpriteState: null };
  }

  let index: number | null = null;

  // ПРИОРИТЕТ 1: Позиция из класса (Favicon-PageX_pos_Y) — это индекс иконки
  const posClassMatch = favEl.className.match(FAVICON_POS_CLASS_REGEX);
  if (posClassMatch && posClassMatch[1]) {
    index = parseInt(posClassMatch[1], 10);
    console.log(`🔍 [processSpriteUrl] Индекс из класса (Page_pos): ${index}`);
  }

  // ПРИОРИТЕТ 2: Вычисляем по background-position
  if (index === null && bgPosition) {
    index = calculateIndexFromPosition(bgPosition, bgSizeValue);
    console.log(`🔍 [processSpriteUrl] Индекс из position: "${bgPosition}", size=${bgSizeValue || 'auto'} => index=${index}`);
  }

  // Если не удалось определить индекс — возвращаем null, НЕ берем "следующий"
  if (index === null) {
    console.warn(`⚠️ [processSpriteUrl] Не удалось определить индекс для сниппета, фавиконка не будет установлена`);
    return { faviconUrl: null, newSpriteState: null };
  }

  // Проверяем границы
  if (index < 0 || index >= domains.length) {
    console.warn(`⚠️ [processSpriteUrl] Индекс ${index} вне границ (0-${domains.length - 1}), фавиконка не будет установлена`);
    return { faviconUrl: null, newSpriteState: null };
  }

  // Извлекаем домен по индексу
  const domain = domains[index];
  const cleanDomain = domain.replace(/^https?:\/\//i, '').split('?')[0].split('/')[0];

  if (!cleanDomain || cleanDomain.trim() === '') {
    console.warn(`⚠️ [processSpriteUrl] Пустой домен на индексе ${index}`);
    return { faviconUrl: null, newSpriteState: null };
  }

  const faviconUrl = `https://favicon.yandex.net/favicon/v2/${encodeURIComponent(cleanDomain)}?size=32&stub=1`;
  console.log(`✅ [processSpriteUrl] Извлечен домен "${cleanDomain}" (индекс ${index}), URL: ${faviconUrl}`);

  // Кэшируем список доменов (для оптимизации, не для последовательного перебора)
  const faviconUrls = domains.map(addr => {
    const clean = addr.trim().split('?')[0];
    if (!clean) return null;
    return `https://favicon.yandex.net/favicon/v2/${encodeURIComponent(clean)}?size=32&stub=1`;
  }).filter((url): url is string => url !== null);

  const newSpriteState: SpriteState = {
    urls: faviconUrls,
    currentIndex: 0 // Не используется для индексации
  };

  return { faviconUrl, newSpriteState };
}

/**
 * Обрабатывает сложную логику со спрайтами когда есть bgPosition
 * но домены нужно извлечь из CSS
 */
function processSpriteWithPosition(
  ctx: FaviconContext,
  result: ExtractorResult
): { faviconUrl: string | null; newSpriteState: SpriteState | null } {
  if (!result.bgPosition) {
    return { faviconUrl: result.bgUrl, newSpriteState: result.newSpriteState };
  }

  const bgUrl = result.bgUrl;
  
  // Если уже содержит спрайт с доменами, используем processSpriteUrl
  if (bgUrl && bgUrl.includes('favicon.yandex.net/favicon/v2/')) {
    return processSpriteUrl(bgUrl, result.bgPosition, result.bgSizeValue, ctx.favEl, result.isInlineUrl, ctx.spriteState);
  }

  // Ищем спрайт в CSS для сопоставления позиции с доменами
  console.log(`🔍 [processSpriteWithPosition] Пытаемся сопоставить bgPosition "${result.bgPosition}" с доменами`);

  const styleTags = getStyleTags(ctx.doc, ctx.rawHtml);
  let spriteUrl: string | null = null;
  let spriteBgSizeValue: number | null = result.bgSizeValue;

  // Ищем правило со спрайтом в CSS
  for (const styleTag of styleTags) {
    const cssText = styleTag.textContent || '';

    const spritePatterns = [SPRITE_RULE_LOWER_REGEX, SPRITE_RULE_UPPER_REGEX];
    for (const pattern of spritePatterns) {
      const match = cssText.match(pattern);
      if (match && match[1]) {
        spriteUrl = match[1].trim();
        const bgSizeStr = match[2] ? match[2].trim() : '';
        const sizeMatches = bgSizeStr.match(PX_VALUES_REGEX);
        if (sizeMatches && sizeMatches.length > 0) {
          spriteBgSizeValue = parseFloat(sizeMatches[0]);
        }
        console.log(`✅ [processSpriteWithPosition] Найдено правило со спрайтом: ${spriteUrl.substring(0, 100)}..., size: ${spriteBgSizeValue || 'n/a'}px`);
        break;
      }
    }
    if (spriteUrl) break;

    // Альтернативный паттерн
    const altMatch = cssText.match(SPRITE_BG_IMAGE_WITH_SIZE_REGEX);
    if (altMatch && altMatch[1]) {
      spriteUrl = altMatch[1].trim();
      const fullRuleMatch = cssText.match(SPRITE_FULL_RULE_REGEX);
      if (fullRuleMatch && fullRuleMatch[1]) {
        const sizeValues = fullRuleMatch[1].trim().match(PX_VALUES_REGEX);
        if (sizeValues && sizeValues.length > 0) {
          spriteBgSizeValue = parseFloat(sizeValues[0]);
        }
      }
      console.log(`✅ [processSpriteWithPosition] Найдено правило (альтернативный паттерн): ${spriteUrl.substring(0, 100)}..., size: ${spriteBgSizeValue || 'n/a'}px`);
      break;
    }
  }

  // Ищем в сыром HTML
  if (!spriteUrl && ctx.rawHtml) {
    const rawPatterns = [
      RAW_HTML_SPRITE_HREF_REGEX,
      RAW_HTML_SPRITE_URL_REGEX,
      RAW_HTML_SPRITE_QUOTED_REGEX,
      RAW_HTML_SPRITE_PLAIN_REGEX
    ];

    for (const pattern of rawPatterns) {
      const matches = ctx.rawHtml.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].includes('favicon.yandex.net/favicon/v2/')) {
          spriteUrl = match[1].trim().replace(QUOTES_REGEX, '').split('?')[0];
          const fullMatch = match[0];
          if (fullMatch.includes('?')) {
            const paramMatch = fullMatch.match(QUERY_PARAMS_REGEX);
            if (paramMatch) {
              spriteUrl = spriteUrl + paramMatch[0];
            }
          }
          console.log(`✅ [processSpriteWithPosition] Найден спрайт в сыром HTML: ${spriteUrl.substring(0, 100)}...`);
          break;
        }
      }
      if (spriteUrl) break;
    }
  }

  if (!spriteUrl || !spriteUrl.includes('favicon.yandex.net/favicon/v2/')) {
    return { faviconUrl: result.bgUrl, newSpriteState: result.newSpriteState };
  }

  // Извлекаем список доменов
  const cleanSpriteUrl = spriteUrl
    .replace(QP_EQUALS_REGEX, '=')
    .replace(QP_SEMICOLON_REGEX, ';')
    .replace(QP_LINEBREAK_REGEX, '');

  const spriteListMatch = cleanSpriteUrl.match(FAVICON_V2_URL_REGEX);
  if (!spriteListMatch || !spriteListMatch[1]) {
    return { faviconUrl: result.bgUrl, newSpriteState: result.newSpriteState };
  }

  let addressesString = spriteListMatch[1];
  // Убираем параметры запроса
  const qIndex = addressesString.lastIndexOf('?');
  if (qIndex !== -1 && (addressesString.includes('size=') || addressesString.includes('stub='))) {
    addressesString = addressesString.substring(0, qIndex);
  } else if (addressesString.includes('?')) {
    addressesString = addressesString.split('?')[0];
  }

  const addresses = addressesString.split(';').filter(addr => addr.trim().length > 0);
  console.log(`🔍 [processSpriteWithPosition] Извлечено ${addresses.length} доменов из спрайта`);

  if (addresses.length === 0) {
    return { faviconUrl: result.bgUrl, newSpriteState: result.newSpriteState };
  }

  // Определяем индекс позиции
  let positionIndex: number | null = null;

  // ПРИОРИТЕТ 1: Класс Favicon-PageX_pos_Y
  const posClassMatch = ctx.favEl.className.match(FAVICON_POS_CLASS_REGEX);
  if (posClassMatch && posClassMatch[1]) {
    positionIndex = parseInt(posClassMatch[1], 10);
    console.log(`🔍 [processSpriteWithPosition] Позиция из класса (Page_pos): ${positionIndex}`);
  }

  // ПРИОРИТЕТ 2: Favicon-EntryN
  const entryClassMatch = ctx.favEl.className.match(FAVICON_ENTRY_CLASS_REGEX);
  if (positionIndex === null && entryClassMatch) {
    const entryNumber = parseInt(entryClassMatch[1] || entryClassMatch[2] || '0', 10);
    positionIndex = entryNumber > 0 ? entryNumber - 1 : 0;
    console.log(`🔍 [processSpriteWithPosition] Позиция из Favicon-Entry (fallback): ${positionIndex}`);
  }

  // ПРИОРИТЕТ 3: Вычисляем по background-position
  if (positionIndex === null && spriteBgSizeValue && result.bgPosition) {
    const posMatches = result.bgPosition.match(PX_NEGATIVE_REGEX);
    if (posMatches && posMatches.length > 0) {
      const posValueStr = posMatches.length > 1 ? posMatches[1] : posMatches[0];
      const posValue = Math.abs(parseFloat(posValueStr));
      positionIndex = Math.floor(posValue / spriteBgSizeValue);
      console.log(`🔍 [processSpriteWithPosition] Вычислен индекс: ${positionIndex} (${posValue}px / ${spriteBgSizeValue}px)`);
    }
  }

  // Извлекаем домен ТОЛЬКО если индекс определен
  if (positionIndex !== null && positionIndex >= 0 && positionIndex < addresses.length) {
    const host = addresses[positionIndex].trim();
    let cleanHost = host.replace(/^https?:\/\//i, '').split('?')[0].split('/')[0];
    if (host.startsWith('https://') || host.startsWith('http://')) {
      cleanHost = host.split('?')[0];
    }

    if (cleanHost && cleanHost.trim() !== '') {
      const faviconUrl = `https://favicon.yandex.net/favicon/v2/${encodeURIComponent(cleanHost)}?size=32&stub=1`;
      console.log(`✅ [processSpriteWithPosition] Сопоставлен домен "${cleanHost}" (индекс ${positionIndex}), URL: ${faviconUrl}`);
      return { faviconUrl, newSpriteState: null };
    }
  }

  // НЕ используем fallback на первый домен — если индекс не определен, оставляем пустым
  if (positionIndex === null) {
    console.warn(`⚠️ [processSpriteWithPosition] Не удалось определить индекс, фавиконка не будет установлена`);
    return { faviconUrl: null, newSpriteState: null };
  }

  // Индекс вне границ
  console.warn(`⚠️ [processSpriteWithPosition] Индекс ${positionIndex} вне границ (0-${addresses.length - 1}), фавиконка не будет установлена`);
  return { faviconUrl: null, newSpriteState: null };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Извлекает фавиконку из контейнера сниппета
 * 
 * ВАЖНО: Каждый сниппет определяет свою иконку независимо по background-position.
 * spriteState используется только для кэширования списка доменов из спрайта,
 * НЕ для последовательного перебора иконок.
 * 
 * @param container - DOM элемент контейнера сниппета
 * @param doc - Document для поиска CSS
 * @param row - Строка CSV для записи результата
 * @param spriteState - Кэш списка доменов из спрайта (НЕ используется для последовательного перебора)
 * @param rawHtml - Сырой HTML (для поиска в MHTML)
 * @returns Обновленное состояние спрайта (кэш) или null
 */
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

    // Пропускаем рекламные сниппеты
    if (isInsideAdvProductGallery(container)) {
      console.log(`⚠️ [FAVICON EXTRACT] Сниппет "${snippetTitle}..." пропущен (рекламный)`);
      return spriteState;
    }

    // Ищем Favicon элемент
    let favEl = container.querySelector('.Favicon, [class*="Favicon"]') as HTMLElement | null;
    console.log(`🔍 [FAVICON EXTRACT] Поиск 1: favEl=${favEl ? `найден (${favEl.className})` : 'не найден'}`);

    // Альтернативные селекторы
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

    // Если Favicon элемент не найден — оставляем поле пустым
    // НЕ используем spriteState.currentIndex, так как порядок сниппетов может не совпадать со спрайтом
    if (!favEl || !container.contains(favEl)) {
      console.log(`⚠️ [FAVICON EXTRACT] Favicon элемент не найден для сниппета "${snippetTitle}...", поле остается пустым`);
      return spriteState; // Возвращаем кэш без изменений
    }

    console.log(`✅ [FAVICON EXTRACT] Favicon элемент найден: className="${favEl.className}"`);

    // Подготавливаем классы для поиска
    const favClasses = favEl.className
      .split(WHITESPACE_SPLIT_REGEX)
      .filter(c => c.includes('Favicon') || c.includes('favicon'))
      .sort((a, b) => b.length - a.length);

    // Создаем контекст
    const ctx: FaviconContext = {
      container,
      doc,
      row,
      spriteState,
      rawHtml,
      favEl,
      favClasses,
      snippetTitle
    };

    // Запускаем цепочку экстракторов
    let result = createEmptyResult(spriteState);
    
    for (const extractor of extractorChain) {
      result = extractor.extract(ctx, result);
      // Продолжаем даже если found=true, чтобы собрать все данные (position, size)
    }

    // Если ничего не нашли — оставляем поле пустым
    // НЕ используем spriteState.currentIndex как fallback
    if (!result.bgUrl || result.bgUrl.trim().length === 0) {
      console.log(`⚠️ [FAVICON EXTRACT] bgUrl пустой после всех экстракторов для "${snippetTitle}..."`);
      console.log(`   🔍 Диагностика: favClasses=[${favClasses.join(', ')}], bgPosition="${result.bgPosition || '(нет)'}"`);
      return spriteState; // Возвращаем кэш без изменений
    }

    // Нормализуем URL
    result.bgUrl = normalizeUrl(result.bgUrl);
    console.log(`🔍 [FAVICON EXTRACT] bgUrl после нормализации: "${result.bgUrl.substring(0, 100)}..."`);

    // Обрабатываем спрайт-URL с перечислением доменов
    let finalUrl: string | null = result.bgUrl;
    let newSpriteState: SpriteState | null = result.newSpriteState;

    if (result.bgUrl.includes('favicon.yandex.net/favicon/v2/') && result.bgUrl.includes(';')) {
      const spriteResult = processSpriteUrl(
        result.bgUrl,
        result.bgPosition,
        result.bgSizeValue,
        favEl,
        result.isInlineUrl,
        spriteState
      );
      finalUrl = spriteResult.faviconUrl;
      newSpriteState = spriteResult.newSpriteState;
    }

    // Дополнительная обработка спрайта с position
    if (result.bgPosition && finalUrl) {
      const posResult = processSpriteWithPosition(ctx, {
        ...result,
        bgUrl: finalUrl,
        newSpriteState
      });
      if (posResult.faviconUrl) {
        finalUrl = posResult.faviconUrl;
      }
      if (posResult.newSpriteState) {
        newSpriteState = posResult.newSpriteState;
      }
    }

    // Проверяем валидность URL — если невалидный, оставляем пустым
    if (!finalUrl || (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://'))) {
      console.log(`⚠️ [FAVICON EXTRACT] bgUrl имеет невалидный формат: "${(finalUrl || '').substring(0, 100)}...", поле остается пустым`);
      return spriteState; // Возвращаем кэш без изменений
    }

    // Записываем результат
    row['#FaviconImage'] = finalUrl;
    console.log(`✅ [FAVICON EXTRACT] Установлен URL (${result.isInlineUrl ? 'inline, единичный' : 'обычный'}): ${row['#FaviconImage'].substring(0, 100)}...`);

    // Возвращаем обновленный кэш спрайта (для оптимизации повторных поисков)
    return newSpriteState || spriteState;

  } catch (e) {
    console.error('❌ [FAVICON EXTRACT] Ошибка парсинга фавиконки:', e);
    return spriteState;
  }
}
