// CSS Cache module - Phase 4 optimization
// Single-pass CSS parsing with cached lookups

import { 
  STYLE_TAG_REGEX, 
  STYLE_TAG_CONTENT_REGEX,
  PX_VALUES_REGEX,
  QUOTES_REGEX
} from './regex';
import { Logger } from '../logger';

// ============================================================================
// TYPES
// ============================================================================

/** Распарсенное CSS правило с background-image */
export interface CSSRuleEntry {
  /** Полный URL из background-image */
  bgUrl: string;
  /** background-position (если есть) */
  bgPosition: string | null;
  /** background-size в px (если есть) */
  bgSize: number | null;
  /** Оригинальный селектор */
  selector: string;
  /** Полный текст правила (для отладки) */
  rawRule: string;
}

/** Кэш CSS правил */
export interface CSSCache {
  /** Map<className, CSSRuleEntry[]> - правила по классу (один класс может быть в нескольких правилах) */
  byClass: Map<string, CSSRuleEntry[]>;
  /** Map<selectorKey, CSSRuleEntry> - правила по полному селектору */
  bySelector: Map<string, CSSRuleEntry>;
  /** Все найденные спрайт-URL (уникальные) */
  spriteUrls: string[];
  /** Кэшированный текст всех стилей (для fallback поиска) */
  allCssText: string;
  /** Статистика для отладки */
  stats: {
    totalStyleTags: number;
    totalRules: number;
    faviconRules: number;
    spriteRules: number;
  };
}

// ============================================================================
// REGEX для парсинга CSS правил
// ============================================================================

// Паттерн для извлечения CSS правил с background-image
// Захватывает: селектор { ... background-image: url(...) ... }
const CSS_RULE_WITH_BG_IMAGE_REGEX = /([^{}]+)\{([^}]*background-image\s*:\s*url\s*\([^)]+\)[^}]*)\}/gi;

// Паттерн для извлечения URL из background-image
const BG_IMAGE_URL_EXTRACT_REGEX = /background-image\s*:\s*url\s*\(\s*["']?([^"')]+)["']?\s*\)/i;

// Паттерн для извлечения background-position
const BG_POSITION_EXTRACT_REGEX = /background-position(?:-[xy])?\s*:\s*([^;]+)/i;

// Паттерн для извлечения background-size
const BG_SIZE_EXTRACT_REGEX = /background-size\s*:\s*([^;]+)/i;

// Паттерн для извлечения классов из селектора
const CLASS_FROM_SELECTOR_REGEX = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;

// Паттерн для favicon классов
const FAVICON_CLASS_REGEX = /favicon/i;

// Паттерн для sprite URL
const SPRITE_URL_PATTERN = /favicon\.yandex\.net\/favicon\/v2\//;

// ============================================================================
// CACHE BUILDER
// ============================================================================

/**
 * Собирает весь CSS текст из документа и сырого HTML
 */
function collectAllCSSText(doc: Document, rawHtml?: string): string {
  const cssTexts: string[] = [];
  
  // 1. Пробуем через querySelectorAll
  const styleTags = doc.querySelectorAll('style');
  if (styleTags.length > 0) {
    for (let i = 0; i < styleTags.length; i++) {
      const text = styleTags[i].textContent || '';
      if (text.trim()) {
        cssTexts.push(text);
      }
    }
  }
  
  // 2. Если не нашли, пробуем через innerHTML
  if (cssTexts.length === 0) {
    const htmlContent = doc.documentElement ? doc.documentElement.innerHTML : '';
    const styleMatches = htmlContent.match(STYLE_TAG_REGEX);
    if (styleMatches && styleMatches.length > 0) {
      for (const match of styleMatches) {
        const contentMatch = match.match(STYLE_TAG_CONTENT_REGEX);
        if (contentMatch && contentMatch[1]) {
          cssTexts.push(contentMatch[1]);
        }
      }
    }
  }
  
  // 3. Если всё ещё пусто и есть rawHtml, ищем там
  if (cssTexts.length === 0 && rawHtml) {
    const styleMatches = rawHtml.match(STYLE_TAG_REGEX);
    if (styleMatches && styleMatches.length > 0) {
      for (const match of styleMatches) {
        const contentMatch = match.match(STYLE_TAG_CONTENT_REGEX);
        if (contentMatch && contentMatch[1]) {
          cssTexts.push(contentMatch[1]);
        }
      }
    }
  }
  
  return cssTexts.join('\n');
}

/**
 * Парсит CSS правило и извлекает данные
 */
function parseCSSRule(selector: string, ruleBody: string): CSSRuleEntry | null {
  // Извлекаем URL
  const urlMatch = ruleBody.match(BG_IMAGE_URL_EXTRACT_REGEX);
  if (!urlMatch || !urlMatch[1]) {
    return null;
  }
  
  const bgUrl = urlMatch[1].replace(QUOTES_REGEX, '').trim();
  if (!bgUrl) {
    return null;
  }
  
  // Извлекаем position
  let bgPosition: string | null = null;
  const posMatch = ruleBody.match(BG_POSITION_EXTRACT_REGEX);
  if (posMatch && posMatch[1]) {
    bgPosition = posMatch[1].trim();
  }
  
  // Извлекаем size
  let bgSize: number | null = null;
  const sizeMatch = ruleBody.match(BG_SIZE_EXTRACT_REGEX);
  if (sizeMatch && sizeMatch[1]) {
    const sizeValues = sizeMatch[1].match(PX_VALUES_REGEX);
    if (sizeValues && sizeValues.length > 0) {
      bgSize = parseFloat(sizeValues[0]);
    }
  }
  
  return {
    bgUrl,
    bgPosition,
    bgSize,
    selector: selector.trim(),
    rawRule: `${selector} { ${ruleBody} }`
  };
}

/**
 * Извлекает классы из CSS селектора
 */
function extractClassesFromSelector(selector: string): string[] {
  const classes: string[] = [];
  const matches = selector.matchAll(CLASS_FROM_SELECTOR_REGEX);
  for (const match of matches) {
    if (match[1]) {
      classes.push(match[1]);
    }
  }
  return classes;
}

/**
 * Построение кэша CSS - ОДИН ПРОХОД при инициализации парсинга
 * 
 * @param doc - Document для поиска style тегов
 * @param rawHtml - Сырой HTML (для MHTML файлов)
 * @returns CSSCache с проиндексированными правилами
 */
export function buildCSSCache(doc: Document, rawHtml?: string): CSSCache {
  const startTime = performance.now();
  
  const byClass = new Map<string, CSSRuleEntry[]>();
  const bySelector = new Map<string, CSSRuleEntry>();
  const spriteUrlsSet = new Set<string>();
  
  let totalRules = 0;
  let faviconRules = 0;
  let spriteRules = 0;
  
  // Собираем весь CSS текст
  const allCssText = collectAllCSSText(doc, rawHtml);
  
  // Считаем style теги для статистики
  const styleTagMatches = allCssText ? allCssText.split(/\n/).length : 0;
  const totalStyleTags = doc.querySelectorAll('style').length || 
    (rawHtml ? (rawHtml.match(STYLE_TAG_REGEX) || []).length : 0);
  
  if (!allCssText || allCssText.trim().length === 0) {
    Logger.debug(`⚠️ [CSSCache] CSS текст не найден`);
    return {
      byClass,
      bySelector,
      spriteUrls: [],
      allCssText: '',
      stats: { totalStyleTags: 0, totalRules: 0, faviconRules: 0, spriteRules: 0 }
    };
  }
  
  // Парсим все правила с background-image
  const ruleMatches = allCssText.matchAll(CSS_RULE_WITH_BG_IMAGE_REGEX);
  
  for (const match of ruleMatches) {
    const selector = match[1];
    const ruleBody = match[2];
    
    if (!selector || !ruleBody) continue;
    
    totalRules++;
    
    const entry = parseCSSRule(selector, ruleBody);
    if (!entry) continue;
    
    // Проверяем, связано ли с favicon
    const isFaviconRelated = FAVICON_CLASS_REGEX.test(selector) || 
                             FAVICON_CLASS_REGEX.test(entry.bgUrl);
    if (isFaviconRelated) {
      faviconRules++;
    }
    
    // Проверяем, является ли спрайтом
    if (SPRITE_URL_PATTERN.test(entry.bgUrl)) {
      spriteRules++;
      spriteUrlsSet.add(entry.bgUrl);
    }
    
    // Индексируем по полному селектору
    const selectorKey = selector.trim().toLowerCase();
    bySelector.set(selectorKey, entry);
    
    // Индексируем по классам
    const classes = extractClassesFromSelector(selector);
    for (const className of classes) {
      const existing = byClass.get(className) || [];
      existing.push(entry);
      byClass.set(className, existing);
    }
  }
  
  const duration = performance.now() - startTime;
  Logger.debug(`✅ [CSSCache] Построен за ${duration.toFixed(2)}ms: ${totalRules} правил с bg-image, ${faviconRules} favicon, ${spriteRules} спрайтов, ${byClass.size} уникальных классов`);
  
  return {
    byClass,
    bySelector,
    spriteUrls: Array.from(spriteUrlsSet),
    allCssText,
    stats: {
      totalStyleTags,
      totalRules,
      faviconRules,
      spriteRules
    }
  };
}

// ============================================================================
// CACHE LOOKUP FUNCTIONS
// ============================================================================

/**
 * Поиск правила по одному классу
 */
export function getRulesByClass(cache: CSSCache, className: string): CSSRuleEntry[] {
  return cache.byClass.get(className) || [];
}

/**
 * Поиск правила по комбинации классов (например, .Favicon-Page0.Favicon-Entry1)
 */
export function getRuleByClasses(cache: CSSCache, classes: string[]): CSSRuleEntry | null {
  if (classes.length === 0) return null;
  
  // Формируем селектор из классов
  const selectorKey = '.' + classes.join('.').toLowerCase();
  
  // Сначала пробуем точное совпадение
  const exactMatch = cache.bySelector.get(selectorKey);
  if (exactMatch) {
    return exactMatch;
  }
  
  // Пробуем в другом порядке
  for (const [selector, entry] of cache.bySelector) {
    const selectorClasses = extractClassesFromSelector(selector);
    if (classes.length === selectorClasses.length && 
        classes.every(c => selectorClasses.includes(c))) {
      return entry;
    }
  }
  
  return null;
}

/**
 * Поиск правила с паттерном класса (для Favicon-PageX, Favicon-EntryX)
 * 
 * ВАЖНО: Если entryClass не задан, ищем правило которое содержит pageClass,
 * но НЕ содержит Entry (чтобы не спутать с более специфичным правилом)
 */
export function getRuleByClassPattern(
  cache: CSSCache, 
  pageClass: string, 
  entryClass?: string
): CSSRuleEntry | null {
  const pageClassLower = pageClass.toLowerCase();
  const entryClassLower = entryClass ? entryClass.toLowerCase() : null;
  
  Logger.debug(`🔍 [getRuleByClassPattern] Поиск: pageClass="${pageClass}", entryClass="${entryClass || 'НЕТ'}"`);
  Logger.debug(`🔍 [getRuleByClassPattern] Всего селекторов в кэше: ${cache.bySelector.size}`);
  
  let checkedCount = 0;
  let matchedWithEntry: string[] = [];
  let matchedWithoutEntry: string[] = [];
  
  for (const [selector, entry] of cache.bySelector) {
    const selectorLower = selector.toLowerCase();
    
    if (!selectorLower.includes(pageClassLower)) continue;
    
    checkedCount++;
    const hasEntry = selectorLower.includes('entry');
    
    if (hasEntry) {
      matchedWithEntry.push(selector.substring(0, 80));
    } else {
      matchedWithoutEntry.push(selector.substring(0, 80));
    }
    
    // Если есть entry класс, ищем комбинацию (page + entry)
    if (entryClassLower) {
      if (selectorLower.includes(entryClassLower)) {
        Logger.debug(`✅ [getRuleByClassPattern] Найдено правило С Entry: "${selector.substring(0, 80)}..."`);
        Logger.debug(`   URL: ${entry.bgUrl.substring(0, 100)}...`);
        return entry;
      }
    } else {
      // ИСПРАВЛЕНИЕ: Ищем правило с page классом, но БЕЗ entry класса
      if (!hasEntry) {
        Logger.debug(`✅ [getRuleByClassPattern] Найдено правило БЕЗ Entry: "${selector.substring(0, 80)}..."`);
        Logger.debug(`   URL: ${entry.bgUrl.substring(0, 100)}...`);
        return entry;
      }
    }
  }
  
  Logger.debug(`⚠️ [getRuleByClassPattern] Не найдено подходящее правило!`);
  Logger.debug(`   Проверено селекторов с pageClass: ${checkedCount}`);
  Logger.debug(`   С Entry: [${matchedWithEntry.join(', ')}]`);
  Logger.debug(`   Без Entry: [${matchedWithoutEntry.join(', ')}]`);
  
  return null;
}

/**
 * Получить первый найденный спрайт URL
 */
export function getFirstSpriteUrl(cache: CSSCache): string | null {
  return cache.spriteUrls.length > 0 ? cache.spriteUrls[0] : null;
}

/**
 * Поиск background-position для класса (когда URL найден inline)
 */
export function getPositionForClass(cache: CSSCache, className: string): string | null {
  const rules = cache.byClass.get(className);
  if (!rules || rules.length === 0) return null;
  
  for (const rule of rules) {
    if (rule.bgPosition) {
      return rule.bgPosition;
    }
  }
  
  return null;
}

/**
 * Поиск background-size для класса
 */
export function getSizeForClass(cache: CSSCache, className: string): number | null {
  const rules = cache.byClass.get(className);
  if (!rules || rules.length === 0) return null;
  
  for (const rule of rules) {
    if (rule.bgSize !== null) {
      return rule.bgSize;
    }
  }
  
  return null;
}

