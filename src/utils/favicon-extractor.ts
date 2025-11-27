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
  QP_LINEBREAK_REGEX
} from './regex';
import { isInsideAdvProductGallery } from './dom-utils';
import { 
  CSSCache, 
  getRulesByClass, 
  getRuleByClassPattern,
  getFirstSpriteUrl
} from './css-cache';
// Phase 5: DOM cache integration
import {
  ContainerCache,
  queryFromCache,
  queryFirstMatch
} from './dom-cache';

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
  /** CSS кэш (Phase 4 optimization) */
  cssCache: CSSCache;
  /** Сырой HTML для fallback поиска спрайтов */
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

  // ИСПРАВЛЕНИЕ: Сначала определяем stride по эвристике (кратность offset),
  // потому что bgSizeValue из CSS может быть шириной спрайта, а не шагом.
  // Например, background-size: 16px 176px — первое значение (16px) это ширина,
  // а реальный шаг между иконками может быть 20px.
  
  let stride = 0;
  
  // Эвристическое определение stride по кратности offset
  // ПРИОРИТЕТ: 20 > 16 > 24 > 32 (наиболее частые размеры фавиконок)
  if (yOffset % 20 === 0) stride = 20;
  else if (yOffset % 16 === 0) stride = 16;
  else if (yOffset % 24 === 0) stride = 24;
  else if (yOffset % 32 === 0) stride = 32;
  
  // Если эвристика не сработала, пробуем bgSizeValue
  if (!stride && bgSizeValue && bgSizeValue > 0) {
    // Проверяем, что bgSizeValue дает целый индекс
    const potentialIndex = yOffset / bgSizeValue;
    if (Number.isInteger(potentialIndex) || Math.abs(potentialIndex - Math.round(potentialIndex)) < 0.1) {
      stride = bgSizeValue;
    }
  }
  
  // Последний fallback
  if (!stride) {
    stride = yOffset <= 20 ? yOffset : 20;
  }

  const index = stride > 0 ? Math.round(yOffset / stride) : 0;
  console.log(`🔍 [calculateIndexFromPosition] yOffset=${yOffset}px, stride=${stride}px => index=${index}`);
  
  return index;
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
 * ОПТИМИЗИРОВАНО: использует CSS кэш вместо повторного парсинга
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

    console.log(`🔍 [${this.name}] ========================================`);
    console.log(`🔍 [${this.name}] Анализ элемента: className="${ctx.favEl.className}"`);
    console.log(`🔍 [${this.name}] pageClassMatch: ${pageClassMatch ? pageClassMatch[0] : 'НЕТ'}`);
    console.log(`🔍 [${this.name}] posClassMatch: ${posClassMatch ? posClassMatch[0] : 'НЕТ'}`);
    console.log(`🔍 [${this.name}] entryClassMatch: ${entryClassMatch ? entryClassMatch[0] : 'НЕТ'}`);

    if (!pageClassMatch) {
      console.log(`⚠️ [${this.name}] Нет pageClass, пропускаем`);
      return prevResult;
    }

    const result = { ...prevResult };
    const pageNumber = pageClassMatch[1] || pageClassMatch[2] || '0';
    const pageClassLower = `favicon_page_${pageNumber}`;
    const pageClassUpper = `Favicon-Page${pageNumber}`;

    console.log(`🔍 [${this.name}] Найден класс страницы: ${pageClassUpper}, hasEntry: ${!!entryClassMatch}`);

    // ОПТИМИЗАЦИЯ: используем CSS кэш вместо getStyleTags()
    
    // ПРИОРИТЕТ 1: Комбинация page + entry классов через кэш
    if (entryClassMatch && !result.bgUrl) {
      const entryNumber = entryClassMatch[1] || entryClassMatch[2] || '1';
      const entryClassLower = `favicon_entry_${entryNumber}`;
      const entryClassUpper = `Favicon-Entry${entryNumber}`;

      // Ищем в кэше по комбинации классов
      const cachedRule = getRuleByClassPattern(ctx.cssCache, pageClassUpper, entryClassUpper) ||
                         getRuleByClassPattern(ctx.cssCache, pageClassLower, entryClassLower);
      
      if (cachedRule) {
        result.bgUrl = cachedRule.bgUrl;
        result.found = true;
        if (cachedRule.bgSize !== null) {
          result.bgSizeValue = cachedRule.bgSize;
        }
        if (cachedRule.bgPosition) {
          result.bgPosition = cachedRule.bgPosition;
        }
        console.log(`✅ [${this.name}] Найден URL спрайта из кэша (комбинация классов): ${result.bgUrl.substring(0, 80)}..., size: ${result.bgSizeValue || 'n/a'}px`);
      }
    }

    // ПРИОРИТЕТ 2: Только page класс через кэш (БЕЗ Entry)
    // ВАЖНО: Используем getRuleByClassPattern без entryClass, 
    // чтобы найти правило .Favicon-Page0.Favicon (без Entry),
    // а не .Favicon-Page0.Favicon-Entry1.Favicon
    if (!result.bgUrl) {
      console.log(`🔍 [${this.name}] ПРИОРИТЕТ 2: bgUrl ещё не найден, ищем по page классу`);
      
      // Если у элемента НЕТ Entry класса, ищем правило без Entry
      const hasEntryClass = !!entryClassMatch;
      console.log(`🔍 [${this.name}] hasEntryClass: ${hasEntryClass}`);
      
      if (!hasEntryClass) {
        console.log(`🔍 [${this.name}] Элемент БЕЗ Entry, вызываем getRuleByClassPattern(${pageClassUpper}, undefined)`);
        // Элемент без Entry — ищем правило без Entry через исправленную функцию
        const ruleWithoutEntry = getRuleByClassPattern(ctx.cssCache, pageClassUpper) ||
                                 getRuleByClassPattern(ctx.cssCache, pageClassLower);
        if (ruleWithoutEntry) {
          result.bgUrl = ruleWithoutEntry.bgUrl;
          result.found = true;
          if (ruleWithoutEntry.bgSize !== null) {
            result.bgSizeValue = ruleWithoutEntry.bgSize;
          }
          console.log(`✅ [${this.name}] Найден URL спрайта из кэша (класс ${pageClassUpper} без Entry): ${result.bgUrl.substring(0, 80)}...`);
        } else {
          console.log(`⚠️ [${this.name}] getRuleByClassPattern не нашла правило без Entry`);
        }
      }
      
      // Fallback: если не нашли, пробуем любое правило с этим классом
      if (!result.bgUrl) {
        console.log(`🔍 [${this.name}] Fallback: пробуем getRulesByClass`);
        const pageRules = getRulesByClass(ctx.cssCache, pageClassUpper) || 
                          getRulesByClass(ctx.cssCache, pageClassLower);
        
        console.log(`🔍 [${this.name}] getRulesByClass вернула ${pageRules ? pageRules.length : 0} правил`);
        
        if (pageRules && pageRules.length > 0) {
          for (let i = 0; i < pageRules.length; i++) {
            console.log(`   [${i}]: ${pageRules[i].bgUrl.substring(0, 80)}...`);
          }
          const rule = pageRules[0];
          result.bgUrl = rule.bgUrl;
          result.found = true;
          if (rule.bgSize !== null) {
            result.bgSizeValue = rule.bgSize;
          }
          console.log(`✅ [${this.name}] Найден URL спрайта из кэша (класс ${pageClassUpper}, fallback): ${result.bgUrl.substring(0, 80)}...`);
        }
      }
    } else {
      console.log(`🔍 [${this.name}] ПРИОРИТЕТ 2 пропущен: bgUrl уже найден`);
    }

    // Извлекаем background-position из класса позиции через кэш
    if (result.bgUrl && posClassMatch && !result.bgPosition) {
      // posClassMatch[1] = индекс позиции, pageNumber = номер страницы
      const posClass = `Favicon-Page${pageNumber}_pos_${posClassMatch[1]}`;
      const posRules = getRulesByClass(ctx.cssCache, posClass);
      
      if (posRules && posRules.length > 0 && posRules[0].bgPosition) {
        result.bgPosition = posRules[0].bgPosition;
        console.log(`✅ [${this.name}] Найдена позиция из кэша (класс ${posClass}): ${result.bgPosition}`);
      }
    }

    return result;
  }
};

/**
 * Экстрактор 3: CSS правила по классам элемента
 * Ищет background-image в CSS по классам Favicon элемента
 * ОПТИМИЗИРОВАНО: использует CSS кэш вместо повторного парсинга
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

    console.log(`🔍 [${this.name}] Поиск в кэше по ${ctx.favClasses.length} классам элемента (кэш: ${ctx.cssCache.stats.faviconRules} favicon правил)`);

    // ОПТИМИЗАЦИЯ: используем CSS кэш

    // Поиск background-position для каждого класса (если URL inline и position не найден)
    if (!result.bgPosition && prevResult.isInlineUrl) {
      for (const favClass of ctx.favClasses) {
        const rules = getRulesByClass(ctx.cssCache, favClass);
        if (rules && rules.length > 0) {
          for (const rule of rules) {
            if (rule.bgPosition) {
              result.bgPosition = rule.bgPosition;
              console.log(`✅ [${this.name}] Найден background-position из кэша для класса "${favClass}": "${result.bgPosition}"`);
              break;
            }
          }
        }
        if (result.bgPosition) break;
      }
    }

    // Поиск background-image (если URL еще не найден)
    if (!result.bgUrl) {
      // По отдельным классам через кэш
      for (const favClass of ctx.favClasses) {
        const rules = getRulesByClass(ctx.cssCache, favClass);
        if (rules && rules.length > 0) {
          const rule = rules[0];
          result.bgUrl = rule.bgUrl;
          result.found = true;
          if (rule.bgSize !== null && result.bgSizeValue === null) {
            result.bgSizeValue = rule.bgSize;
          }
          if (rule.bgPosition && !result.bgPosition) {
            result.bgPosition = rule.bgPosition;
          }
          console.log(`✅ [${this.name}] Найден bgUrl из кэша по классу "${favClass}": ${result.bgUrl.substring(0, 80)}...`);
          break;
        }
      }
    }

    // Диагностика если не нашли
    if (!result.bgUrl) {
      console.log(`⚠️ [${this.name}] Не найдено bgUrl по классам. Статистика кэша: ${ctx.cssCache.stats.faviconRules} favicon, ${ctx.cssCache.stats.spriteRules} спрайтов`);
    }

    return result;
  }
};

/**
 * Экстрактор 4: Поиск спрайтов в CSS/HTML при наличии background-position
 * Когда есть позиция, но нет URL — ищем спрайт в кэше или сыром HTML
 * ОПТИМИЗИРОВАНО: использует CSS кэш для быстрого поиска спрайтов
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

    let spriteUrl: string | null = null;
    let bgSizeValue: number | null = result.bgSizeValue;

    // ОПТИМИЗАЦИЯ: Сначала ищем в кэше
    spriteUrl = getFirstSpriteUrl(ctx.cssCache);
    if (spriteUrl) {
      console.log(`✅ [${this.name}] Найден спрайт URL в кэше: ${spriteUrl.substring(0, 100)}...`);
      
      // Ищем size в кэше для этого URL
      if (!bgSizeValue) {
        // Берём первое правило с этим спрайтом, у которого есть size
        for (const rules of ctx.cssCache.byClass.values()) {
          for (const rule of rules) {
            if (rule.bgUrl === spriteUrl && rule.bgSize !== null) {
              bgSizeValue = rule.bgSize;
              console.log(`✅ [${this.name}] Найден background-size из кэша: ${bgSizeValue}px`);
              break;
            }
          }
          if (bgSizeValue !== null) break;
        }
      }
    }

    // Поиск в сыром HTML (если не нашли в кэше)
    if (!spriteUrl && ctx.rawHtml) {
      console.log(`🔍 [${this.name}] Не найдено в кэше, ищем спрайт в сыром HTML...`);

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
 * ОПТИМИЗИРОВАНО: использует CSS кэш вместо повторного парсинга
 */
function processSpriteWithPosition(
  ctx: FaviconContext,
  result: ExtractorResult
): { faviconUrl: string | null; newSpriteState: SpriteState | null } {
  if (!result.bgPosition) {
    return { faviconUrl: result.bgUrl, newSpriteState: result.newSpriteState };
  }

  const bgUrl = result.bgUrl;
  
  // Если уже содержит спрайт с доменами (наличие ';' означает список), используем processSpriteUrl
  // ВАЖНО: проверяем ';' чтобы не перезаписывать уже извлечённый единичный URL
  if (bgUrl && bgUrl.includes('favicon.yandex.net/favicon/v2/') && bgUrl.includes(';')) {
    return processSpriteUrl(bgUrl, result.bgPosition, result.bgSizeValue, ctx.favEl, result.isInlineUrl, ctx.spriteState);
  }
  
  // Если URL уже единичный (без списка доменов), возвращаем как есть
  if (bgUrl && bgUrl.includes('favicon.yandex.net/favicon/v2/') && !bgUrl.includes(';')) {
    console.log(`🔍 [processSpriteWithPosition] URL уже единичный, пропускаем: ${bgUrl.substring(0, 80)}...`);
    return { faviconUrl: bgUrl, newSpriteState: result.newSpriteState };
  }

  // Ищем спрайт в CSS кэше для сопоставления позиции с доменами
  console.log(`🔍 [processSpriteWithPosition] Пытаемся сопоставить bgPosition "${result.bgPosition}" с доменами`);

  let spriteUrl: string | null = null;
  let spriteBgSizeValue: number | null = result.bgSizeValue;

  // ОПТИМИЗАЦИЯ: Используем кэш вместо перебора styleTags
  spriteUrl = getFirstSpriteUrl(ctx.cssCache);
  if (spriteUrl) {
    console.log(`✅ [processSpriteWithPosition] Найден спрайт в кэше: ${spriteUrl.substring(0, 100)}...`);
    
    // Ищем size в кэше
    if (!spriteBgSizeValue) {
      for (const rules of ctx.cssCache.byClass.values()) {
        for (const rule of rules) {
          if (rule.bgUrl === spriteUrl && rule.bgSize !== null) {
            spriteBgSizeValue = rule.bgSize;
            console.log(`✅ [processSpriteWithPosition] Найден size из кэша: ${spriteBgSizeValue}px`);
            break;
          }
        }
        if (spriteBgSizeValue !== null) break;
      }
    }
  }

  // Ищем в сыром HTML (если не нашли в кэше)
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
 * ОПТИМИЗИРОВАНО (Phase 4): использует CSS кэш вместо повторного парсинга
 * ОПТИМИЗИРОВАНО (Phase 5): использует DOM кэш для быстрого поиска элементов
 * 
 * @param container - DOM элемент контейнера сниппета
 * @param doc - Document для поиска CSS
 * @param row - Строка CSV для записи результата
 * @param spriteState - Кэш списка доменов из спрайта (НЕ используется для последовательного перебора)
 * @param cssCache - CSS кэш (Phase 4 optimization)
 * @param rawHtml - Сырой HTML (для fallback поиска в MHTML)
 * @param containerCache - DOM кэш контейнера (Phase 5 optimization, опционально)
 * @returns Обновленное состояние спрайта (кэш) или null
 */
export function extractFavicon(
  container: Element,
  doc: Document,
  row: CSVRow,
  spriteState: SpriteState | null,
  cssCache: CSSCache,
  rawHtml?: string,
  containerCache?: ContainerCache
): SpriteState | null {
  try {
    const snippetTitle = row['#OrganicTitle']?.substring(0, 30) || 'unknown';
    console.log(`🔍 [FAVICON EXTRACT] Начало извлечения фавиконки для сниппета "${snippetTitle}..."`);

    // Пропускаем рекламные сниппеты
    if (isInsideAdvProductGallery(container)) {
      console.log(`⚠️ [FAVICON EXTRACT] Сниппет "${snippetTitle}..." пропущен (рекламный)`);
      return spriteState;
    }

    // Ищем Favicon элемент с ПРИОРИТЕТОМ на элементы с позицией (_pos_X)
    // и НЕ внутри рекламной галереи (AdvProductGallery)
    let favEl: HTMLElement | null = null;
    
    // ПРИОРИТЕТ 1: Ищем Favicon с классом Favicon-Page*_pos_* (содержит позицию)
    // и проверяем, что он НЕ внутри рекламной галереи
    const allFavicons = container.querySelectorAll('.Favicon, [class*="Favicon"]');
    console.log(`🔍 [FAVICON EXTRACT] Найдено ${allFavicons.length} Favicon элементов в контейнере`);
    
    for (let i = 0; i < allFavicons.length; i++) {
      const fav = allFavicons[i] as HTMLElement;
      const className = fav.className || '';
      
      // Пропускаем Favicon внутри рекламной галереи
      const isInsideAdv = fav.closest('.AdvProductGallery') !== null || 
                          fav.closest('[class*="AdvProductGallery"]') !== null ||
                          fav.closest('.AdvProductGalleryCard') !== null ||
                          className.includes('AdvProductGallery');
      
      if (isInsideAdv) {
        console.log(`🔍 [FAVICON EXTRACT] Пропущен Favicon внутри рекламы: ${className.substring(0, 50)}...`);
        continue;
      }
      
      // Проверяем, есть ли _pos_ в классе (приоритетный выбор)
      const hasPosition = className.includes('_pos_');
      
      if (hasPosition) {
        favEl = fav;
        console.log(`🔍 [FAVICON EXTRACT] Найден Favicon с позицией: ${className.substring(0, 60)}...`);
        break;
      }
      
      // Сохраняем первый подходящий (без рекламы) как fallback
      if (!favEl) {
        favEl = fav;
      }
    }
    
    if (favEl) {
      console.log(`🔍 [FAVICON EXTRACT] Выбран Favicon: ${favEl.className.substring(0, 60)}...`);
    }

    // ПРИОРИТЕТ 2: Если не нашли, ищем через EShopName
    if (!favEl) {
      const shopNameEl = container.querySelector('.EShopName, [class*="EShopName"], [class*="ShopName"]');
      
      if (shopNameEl) {
        // Ищем Favicon рядом с EShopName (в том же родителе)
        const parent = shopNameEl.parentElement;
        if (parent) {
          favEl = parent.querySelector('.Favicon, [class*="Favicon"]') as HTMLElement | null;
          if (favEl && !container.contains(favEl)) {
            favEl = null;
          }
        }
        console.log(`🔍 [FAVICON EXTRACT] Поиск через EShopName: favEl=${favEl ? `найден (${favEl.className.substring(0, 40)}...)` : 'не найден'}`);
      }
    }

    // ПРИОРИТЕТ 3: Через ImagePlaceholder
    if (!favEl) {
      const imagePlaceholder = container.querySelector('[class*="ImagePlaceholder"], [class*="Image-Placeholder"]');
      
      if (imagePlaceholder) {
        favEl = imagePlaceholder.querySelector('.Favicon, [class*="Favicon"], [class*="FaviconImage"]') as HTMLElement | null;
        console.log(`🔍 [FAVICON EXTRACT] Поиск через ImagePlaceholder: favEl=${favEl ? `найден` : 'не найден'}`);
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
      cssCache,
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
    // НЕ вызываем, если URL уже единичный (без ';') или если это inline URL
    const isAlreadySingleUrl = finalUrl && 
                               finalUrl.includes('favicon.yandex.net/favicon/v2/') && 
                               !finalUrl.includes(';');
    
    if (result.bgPosition && finalUrl && !isAlreadySingleUrl && !result.isInlineUrl) {
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
