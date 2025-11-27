// Snippet parsing utilities for Yandex search results

import { CSVRow } from '../types';
import {
  STYLE_TAG_REGEX,
  LINK_STYLESHEET_REGEX,
  PRICE_DIGITS_REGEX,
  CURRENCY_RUB_REGEX,
  CURRENCY_USD_REGEX,
  CURRENCY_EUR_REGEX,
  DISCOUNT_PERCENT_REGEX,
  DISCOUNT_VALUE_REGEX,
  RATING_REGEX,
  REVIEWS_REGEX,
  RATING_INVALID_START_REGEX
} from './regex';
import { getTextContent } from './encoding';
import { 
  findSnippetContainers, 
  filterTopLevelContainers, 
  isInsideAdvProductGallery,
  extractProductURL
} from './dom-utils';
import { extractPrices, formatPriceWithThinSpace } from './price-extractor';
import { extractFavicon, SpriteState } from './favicon-extractor';
import { CSSCache, buildCSSCache } from './css-cache';

// Извлекает все данные строки из контейнера
// spriteState - состояние текущего спрайта
// cssCache - кэш CSS правил (Phase 4 optimization)
// Возвращает { row: CSVRow | null, spriteState: состояние спрайта }
export function extractRowData(
  container: Element, 
  doc: Document,
  spriteState: SpriteState | null,
  cssCache: CSSCache,
  rawHtml?: string
): { row: CSVRow | null; spriteState: SpriteState | null } {
    // Пропускаем рекламные сниппеты
    // Также проверяем дополнительные классы, которые могут указывать на рекламу
    if (isInsideAdvProductGallery(container) || 
        container.closest('.AdvProductGallery') || 
        container.closest('[class*="AdvProductGallery"]') ||
        // Иногда рекламные блоки не внутри AdvProductGallery, но имеют свои маркеры
        container.querySelector('.Organic-Label_type_advertisement') ||
        container.querySelector('.Organic-Subtitle_type_advertisement')) {
      console.log('⚠️ Пропущен рекламный сниппет (AdvProductGallery или рекламная метка)');
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
  
  // #FaviconImage (ОПТИМИЗИРОВАНО: используем CSS кэш)
  spriteState = extractFavicon(container, doc, row, spriteState, cssCache, rawHtml);
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
      const discountMatch = discountText.match(DISCOUNT_VALUE_REGEX);
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
        const discountMatch = discountText.match(DISCOUNT_VALUE_REGEX);
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
    if (trimmed.includes('%') || RATING_INVALID_START_REGEX.test(trimmed)) {
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
export function deduplicateRows(rows: CSVRow[]): CSVRow[] {
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

// Parse Yandex search results from HTML
export function parseYandexSearchResults(html: string, fullMhtml?: string): { rows: CSVRow[], error?: string } {
  console.log('🔍 HTML разбор начат');
  try {
  console.log('📄 Размер HTML:', html.length);
  if (fullMhtml) {
    console.log('📄 Размер полного содержимого файла:', fullMhtml.length);
  }
  
  // ДИАГНОСТИКА: Проверяем наличие <style> тегов в сыром HTML до парсинга
  const rawStyleMatches = html.match(STYLE_TAG_REGEX);
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
  const linkMatches = html.match(LINK_STYLESHEET_REGEX);
  const linkCount = linkMatches ? linkMatches.length : 0;
  console.log(`🔍 [DIAGNOSTIC] Найдено <link rel="stylesheet"> тегов: ${linkCount}`);
  
  // Создаем DOM парсер для разбора HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // PHASE 4 OPTIMIZATION: Строим CSS кэш ОДИН РАЗ при инициализации
  const cssCache = buildCSSCache(doc, fullMhtml || html);
  console.log(`✅ [CSS CACHE] Построен: ${cssCache.stats.totalRules} правил, ${cssCache.stats.faviconRules} favicon, ${cssCache.stats.spriteRules} спрайтов`);
  
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
  let spriteState: SpriteState | null = null;
  
  for (const container of containers) {
    // Передаем CSS кэш и полный контент (для fallback поиска спрайтов)
    const result = extractRowData(container, doc, spriteState, cssCache, fullMhtml || html);
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

