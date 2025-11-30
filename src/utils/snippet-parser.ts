// Snippet parsing utilities for Yandex search results

import { CSVRow } from '../types';
import { ParsingSchema, DEFAULT_PARSING_RULES } from '../parsing-rules';
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
// Phase 5: DOM cache for optimized element lookup
import { 
  ContainerCache, 
  buildContainerCache, 
  queryFromCache, 
  queryFirstMatch,
  queryAllFromCache
} from './dom-cache';

// Извлекает все данные строки из контейнера
// spriteState - состояние текущего спрайта
// cssCache - кэш CSS правил (Phase 4 optimization)
// containerCache - кэш элементов контейнера (Phase 5 optimization, опционально)
// Возвращает { row: CSVRow | null, spriteState: состояние спрайта }
export function extractRowData(
  container: Element, 
  doc: Document,
  spriteState: SpriteState | null,
  cssCache: CSSCache,
  rawHtml?: string,
  containerCache?: ContainerCache,
  parsingRules: ParsingSchema = DEFAULT_PARSING_RULES
): { row: CSVRow | null; spriteState: SpriteState | null } {
    // Phase 5: Строим кэш элементов контейнера, если не передан
    const cache = containerCache || buildContainerCache(container);
    const rules = parsingRules.rules;
    
    // Пропускаем рекламные сниппеты
    // ОПТИМИЗИРОВАНО: используем кэш вместо querySelector
    const hasAdvLabel = queryFromCache(cache, '.Organic-Label_type_advertisement') ||
                        queryFromCache(cache, '.Organic-Subtitle_type_advertisement');
    
    // Проверяем AdvProductGalleryCard — рекламные карточки товаров
    const isAdvGalleryCard = container.classList.contains('AdvProductGalleryCard') ||
                             container.className.includes('AdvProductGalleryCard') ||
                             container.closest('.AdvProductGalleryCard') !== null ||
                             container.closest('[class*="AdvProductGalleryCard"]') !== null;
    
    if (isInsideAdvProductGallery(container) || 
        container.closest('.AdvProductGallery') || 
        container.closest('[class*="AdvProductGallery"]') ||
        isAdvGalleryCard ||
        hasAdvLabel) {
      console.log('⚠️ Пропущен рекламный сниппет (AdvProductGallery/AdvProductGalleryCard или рекламная метка)');
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
  
  // #OrganicTitle — ОПТИМИЗИРОВАНО (Phase 5): queryFirstMatch вместо querySelector
  const snippetType = row['#SnippetType'];
  let titleEl: Element | null = queryFirstMatch(cache, rules['#OrganicTitle'].domSelectors);
  if (!titleEl) {
    // Fallback: ищем ссылку внутри заголовка (если не найдено по основным селекторам)
    if (snippetType === 'EShopItem') {
      titleEl = container.querySelector('.EShopItem-Title, [class*="EShopItem-Title"]');
    } else {
      titleEl = container.querySelector('.EProductSnippet2-Title a, [class*="EProductSnippet2-Title"] a');
    }
  }
  if (titleEl) {
    row['#OrganicTitle'] = getTextContent(titleEl);
  }
  
  // #ShopName — ОПТИМИЗИРОВАНО (Phase 5)
  // Сначала пробуем получить чистое имя из Line-AddonContent (без текста OfficialShop)
  if (snippetType === 'EProductSnippet2' || snippetType === 'EShopItem') {
    // Для EShopItem: ищем в EShopItem-ShopName
    // Для EProductSnippet2: ищем в EShopName
    const shopNameSelectors = snippetType === 'EShopItem'
      ? ['.EShopItem-ShopName .Line-AddonContent', '[class*="EShopItem-ShopName"] .Line-AddonContent', '.EShopItem-ShopName .EShopName', '.EShopItem-ShopName']
      : ['.EShopName .Line-AddonContent', '[class*="EShopName"] .Line-AddonContent'];
    
    const shopNameClean = queryFirstMatch(cache, shopNameSelectors);
    if (shopNameClean) {
      row['#ShopName'] = getTextContent(shopNameClean);
    } else {
      // Fallback: весь EShopName (может содержать OfficialShop текст)
      const shopName = queryFromCache(cache, '.EShopName');
      if (shopName) {
        row['#ShopName'] = getTextContent(shopName);
      }
    }
  }
  
  // Fallback для ShopName если не найдено
  if (!row['#ShopName']) {
    const shopNameAlt = queryFirstMatch(cache, rules['#ShopName'].domSelectors);
    if (shopNameAlt) {
      row['#ShopName'] = getTextContent(shopNameAlt);
    } else if (row['#OrganicHost']) {
      row['#ShopName'] = row['#OrganicHost'];
    }
  }
  
  // #OfficialShop — проверяем наличие метки официального магазина внутри EShopName
  const officialShopSelectors = rules['OfficialShop']?.domSelectors || ['.EShopName .OfficialShop', '[class*="EShopName"] .OfficialShop'];
  const officialShop = queryFirstMatch(cache, officialShopSelectors);
  if (officialShop) {
    row['#OfficialShop'] = 'true';
    console.log(`✅ Найден OfficialShop в сниппете "${row['#OrganicTitle']?.substring(0, 30)}..." (магазин: ${row['#ShopName']})`);
  } else {
    row['#OfficialShop'] = 'false';
  }
  
  // #OrganicPath — ОПТИМИЗИРОВАНО (Phase 5)
  const path = queryFirstMatch(cache, rules['#OrganicPath'].domSelectors);
  if (path) {
    const fixedPathText = getTextContent(path);
    const firstSeparator = fixedPathText.indexOf('›');
    row['#OrganicPath'] = firstSeparator > 0 ? fixedPathText.substring(firstSeparator + 1).trim() : fixedPathText;
  }
  
  // #FaviconImage (ОПТИМИЗИРОВАНО: используем CSS кэш + DOM кэш)
  spriteState = extractFavicon(container, doc, row, spriteState, cssCache, rawHtml, cache);
  console.log(`🔍 [PARSE] После extractFavicon: row['#FaviconImage']="${row['#FaviconImage'] || '(пусто)'}"`);
  
  // #OrganicText — ОПТИМИЗИРОВАНО (Phase 5)
  const textContent = queryFirstMatch(cache, rules['#OrganicText'].domSelectors);
  if (textContent) {
    row['#OrganicText'] = getTextContent(textContent);
  }
  
  // #OrganicImage — ОПТИМИЗИРОВАНО (Phase 5)
  const image = queryFirstMatch(cache, rules['#OrganicImage'].domSelectors);
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
  // ОПТИМИЗИРОВАНО (Phase 5)
  const priceGroupPair = queryFirstMatch(cache, rules['EPriceGroup_Pair'].domSelectors);
  if (priceGroupPair) {
    console.log('✅ Найден EPriceGroup-Pair, обрабатываем специальную логику цен');
    
    // 1. НЕ устанавливаем Variant Properties сразу!
    // Установим #EPriceGroup_Discount и #EPriceGroup_OldPrice только если найдём реальные данные
    
    // 2. Извлекаем #OrganicPrice из блока с классом EPriceGroup-Price (текущая цена)
    // Ищем .EPrice-Value внутри .EPriceGroup-Price (но не внутри .EPrice_view_old)
    const priceGroupEl = queryFirstMatch(cache, ['.EPriceGroup', '[class*="EPriceGroup"]']); // rules['EPriceGroup_Container'].domSelectors
    if (priceGroupEl) {
      // Ищем цену в .EPriceGroup-Price, но не в .EPrice_view_old
      const currentPriceEl = queryFirstMatch(cache, rules['EPriceGroup_Price'].domSelectors) || 
                             priceGroupEl.querySelector('.EPriceGroup-Price:not(.EPrice_view_old) .EPrice-Value, [class*="EPriceGroup-Price"]:not([class*="EPrice_view_old"]) .EPrice-Value');
                             
      if (currentPriceEl) {
        const currentPriceText = currentPriceEl.textContent?.trim() || '';
        const currentPriceDigits = currentPriceText.replace(PRICE_DIGITS_REGEX, '');
        if (currentPriceDigits.length >= 1) {
          // Форматируем цену с математическим пробелом
          const formattedPrice = formatPriceWithThinSpace(currentPriceDigits);
          row['#OrganicPrice'] = formattedPrice;
          
          // Также извлекаем валюту
          const currencyEl = queryFirstMatch(cache, rules['EPriceGroup_Currency'].domSelectors) ||
                             priceGroupEl.querySelector('.EPriceGroup-Price:not(.EPrice_view_old) .EPrice-Currency, [class*="EPriceGroup-Price"]:not([class*="EPrice_view_old"]) .EPrice-Currency');
                             
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
    const oldPriceEl = queryFirstMatch(cache, rules['EPrice_Old'].domSelectors) ||
                       priceGroupPair.querySelector('.EPrice_view_old .EPrice-Value, [class*="EPrice_view_old"] .EPrice-Value, .EPrice_view_old [class*="EPrice-Value"]');
                       
    if (oldPriceEl) {
      const oldPriceText = oldPriceEl.textContent?.trim() || '';
      // Очищаем значение цены (убираем все кроме цифр)
      const oldPriceDigits = oldPriceText.replace(PRICE_DIGITS_REGEX, '');
      if (oldPriceDigits.length >= 1) {
        // Форматируем цену с математическим пробелом
        const formattedOldPrice = formatPriceWithThinSpace(oldPriceDigits);
        row['#OldPrice'] = formattedOldPrice;
        row['#EPriceGroup_OldPrice'] = 'true';  // ← Только если есть данные
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
          row['#EPriceGroup_OldPrice'] = 'true';  // ← Только если есть данные
          console.log(`✅ Извлечена старая цена из EPrice_view_old (fallback): ${formattedOldPrice}`);
        }
      }
    }
    
    // 4. Извлекаем #discount из блока с классом LabelDiscount
    // Ищем конкретно .Label-Content внутри .LabelDiscount, где находится текст скидки
    const discountContentEl = queryFirstMatch(cache, rules['LabelDiscount_Content'].domSelectors) ||
                              priceGroupPair.querySelector('.LabelDiscount .Label-Content, [class*="LabelDiscount"] .Label-Content, .LabelDiscount [class*="Label-Content"]');
                              
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
        row['#EPriceGroup_Discount'] = 'true';  // ← Только если есть данные
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
          row['#EPriceGroup_Discount'] = 'true';  // ← Только если есть данные
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
    const discount = queryFirstMatch(cache, rules['#DiscountPercent'].domSelectors) ||
                     container.querySelector('.Price-DiscountPercent, [class*="Price-DiscountPercent"], .EProductSnippet2-Discount, [class*="Discount"]');
    if (discount) {
      const discText = discount.textContent?.trim() || '';
      const match = discText.match(DISCOUNT_PERCENT_REGEX);
      if (match) row['#DiscountPercent'] = match[1];
    }
  }
  
  // #ShopRating — ОПТИМИЗИРОВАНО (Phase 5)
  const rating = queryFirstMatch(cache, rules['#ShopRating'].domSelectors) ||
                 container.querySelector('[aria-label*="рейтинг" i]');
  if (rating) {
    const ratingText = rating.textContent?.trim() || '';
    const match = ratingText.match(RATING_REGEX);
    if (match) row['#ShopRating'] = match[1];
  }
  
  // #ReviewsNumber — ОПТИМИЗИРОВАНО (Phase 5)
  const reviews = queryFirstMatch(cache, rules['#ReviewsNumber'].domSelectors) ||
                  container.querySelector('[aria-label*="отзыв" i]');
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
  
  // Пробуем разные варианты поиска элемента с рейтингом — ОПТИМИЗИРОВАНО (Phase 5)
  let labelRating = queryFirstMatch(cache, rules['#ProductRating'].domSelectors);
  
  // Если не нашли, пробуем найти через другие варианты классов (уже есть в конфиге, но для безопасности)
  if (!labelRating) {
    labelRating = queryFirstMatch(cache, ['[class*="LabelRating"]', '[class*="label-rating"]']);
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
  
  // #EMarketCheckoutLabel - проверяем наличие лейбла "Покупки" — ОПТИМИЗИРОВАНО (Phase 5)
  const marketCheckoutLabel = queryFirstMatch(cache, rules['EMarketCheckoutLabel']?.domSelectors || ['.EMarketCheckoutLabel', '[class*="EMarketCheckoutLabel"]']);
  if (marketCheckoutLabel) {
    console.log(`✅ Найден EMarketCheckoutLabel в сниппете "${row['#OrganicTitle']?.substring(0, 30)}..."`);
    row['#EMarketCheckoutLabel'] = 'true';
  } else {
    row['#EMarketCheckoutLabel'] = 'false';
  }
  
  // #EDeliveryGroup - блок с вариантами доставки
  // Используем более специфичный селектор чтобы найти контейнер, а не Item
  const deliveryGroupSelectors = ['.EDeliveryGroup', '[class*="EDeliveryGroup"]:not([class*="EDeliveryGroup-Item"])'];
  const deliveryGroup = queryFirstMatch(cache, deliveryGroupSelectors);
  
  if (deliveryGroup) {
    row['#EDeliveryGroup'] = 'true';
    
    // Извлекаем все EDeliveryGroup-Item из этого контейнера
    const itemSelector = '.EDeliveryGroup-Item';
    const items = queryAllFromCache(cache, itemSelector);
    
    // Фильтруем только те, что внутри EDeliveryGroup (не A11yHidden)
    const deliveryItems: string[] = [];
    for (let i = 0; i < items.length && i < 5; i++) {
      const item = items[i];
      // Пропускаем скрытые элементы (A11yHidden)
      const parentClasses = item.parentElement?.className || '';
      if (parentClasses.includes('A11yHidden')) continue;
      
      const itemText = item.textContent?.trim();
      if (itemText && !deliveryItems.includes(itemText)) {
        deliveryItems.push(itemText);
      }
    }
    
    // Сохраняем каждый item в отдельное поле (#EDeliveryGroup-Item-1, #EDeliveryGroup-Item-2, ...)
    for (let i = 0; i < deliveryItems.length; i++) {
      row[`#EDeliveryGroup-Item-${i + 1}`] = deliveryItems[i];
    }
    
    // Также сохраняем количество items
    row['#EDeliveryGroup-Count'] = String(deliveryItems.length);
    
    console.log(`✅ Найден EDeliveryGroup с ${deliveryItems.length} items: ${deliveryItems.join(', ')}`);
  } else {
    row['#EDeliveryGroup'] = 'false';
    row['#EDeliveryGroup-Count'] = '0';
  }
  
  // #EPrice_view_special - специальный вид цены (зелёная)
  const priceSpecial = queryFirstMatch(cache, rules['EPrice_view_special']?.domSelectors || ['.EPrice_view_special', '[class*="EPrice_view_special"]']);
  if (priceSpecial) {
    row['#EPrice_View'] = 'special';
    console.log(`✅ Найден EPrice_view_special в сниппете "${row['#OrganicTitle']?.substring(0, 30)}..."`);
  }
  
  // #Label_view_outlineSpecial - скидка с outline и словом "Вам"
  const labelOutlineSpecial = queryFirstMatch(cache, rules['Label_view_outlineSpecial']?.domSelectors || ['.Label_view_outlineSpecial', '[class*="Label_view_outlineSpecial"]']);
  if (labelOutlineSpecial) {
    row['#LabelDiscount_View'] = 'outlineSpecial';
    row['#DiscountPrefix'] = 'Вам';
    
    // Формируем полный текст "Вам –X%" для #discount, чтобы processTextLayers не перезаписал его
    const discountVal = row['#discount'] || row['#DiscountPercent'];
    if (discountVal) {
      // Форматируем: добавляем "Вам " перед значением скидки
      const cleanDiscount = discountVal.replace(/^[–-]?\s*/, ''); // Убираем минус в начале если есть
      row['#discount'] = `Вам –${cleanDiscount}`;
      console.log(`✅ Найден Label_view_outlineSpecial, сформирован текст: "${row['#discount']}"`);
    } else {
      console.log(`✅ Найден Label_view_outlineSpecial с префиксом "Вам" в сниппете "${row['#OrganicTitle']?.substring(0, 30)}..."`);
    }
  }
  
  // #Fintech - блок рассрочки/оплаты (Сплит/Пэй)
  const fintechSelectors = ['.Fintech:not(.Fintech-Icon)', '[class*="EPriceGroup-Fintech"]'];
  const fintech = queryFirstMatch(cache, fintechSelectors);
  if (fintech) {
    row['#EPriceGroup_Fintech'] = 'true';
    
    // Определяем type (Split или Pay)
    const fintechClasses = fintech.className || '';
    if (fintechClasses.includes('Fintech_type_split')) {
      row['#Fintech_Type'] = 'Split';
      console.log(`✅ Найден Fintech type=Split`);
    } else if (fintechClasses.includes('Fintech_type_pay')) {
      row['#Fintech_Type'] = 'Pay';
      console.log(`✅ Найден Fintech type=Pay`);
    }
    
    // Определяем view (значения с большой буквы как в Figma)
    if (fintechClasses.includes('Fintech_view_extra-short')) {
      row['#Fintech_View'] = 'Extra Short';
      console.log(`✅ Fintech view=Extra Short`);
    } else if (fintechClasses.includes('Fintech_view_short')) {
      row['#Fintech_View'] = 'Short';
      console.log(`✅ Fintech view=Short`);
    } else if (fintechClasses.includes('Fintech_view_long')) {
      row['#Fintech_View'] = 'Long';
      console.log(`✅ Fintech view=Long`);
    } else if (fintechClasses.includes('Fintech_view_extra-long')) {
      row['#Fintech_View'] = 'Extra Long';
      console.log(`✅ Fintech view=Extra Long`);
    }
  } else {
    row['#EPriceGroup_Fintech'] = 'false';
  }
  
  // #EBnpl - блок BNPL (Buy Now Pay Later) в EShopItem
  const ebnplSelectors = rules['EBnpl']?.domSelectors || ['.EShopItem-Bnpl', '[class*="EShopItem-Bnpl"]', '.EBnpl'];
  const ebnplContainer = queryFirstMatch(cache, ebnplSelectors);
  if (ebnplContainer) {
    row['#EBnpl'] = 'true';
    
    // Извлекаем список BNPL опций (Сплит, Долями и т.д.)
    const ebnplItemSelectors = rules['EBnpl-Item']?.domSelectors || ['.EBnpl .Line-AddonContent', '[class*="EBnpl"] .Line-AddonContent'];
    const ebnplItems = queryAllFromCache(cache, ebnplItemSelectors[0]);
    const bnplOptions: string[] = [];
    
    for (let i = 0; i < ebnplItems.length && i < 5; i++) {
      const itemText = ebnplItems[i].textContent?.trim();
      if (itemText && !bnplOptions.includes(itemText)) {
        bnplOptions.push(itemText);
      }
    }
    
    // Сохраняем каждую опцию в отдельное поле
    for (let i = 0; i < bnplOptions.length; i++) {
      row[`#EBnpl-Item-${i + 1}`] = bnplOptions[i];
    }
    row['#EBnpl-Count'] = String(bnplOptions.length);
    
    console.log(`✅ Найден EBnpl с ${bnplOptions.length} опциями: ${bnplOptions.join(', ')}`);
  } else {
    row['#EBnpl'] = 'false';
    row['#EBnpl-Count'] = '0';
  }
  
  // #EPriceBarometer - проверяем наличие и определяем view — ОПТИМИЗИРОВАНО (Phase 5)
  const priceBarometer = queryFirstMatch(cache, rules['EPriceBarometer'].domSelectors);
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
  
  // #Quote - цитата из отзыва (для ESnippet)
  const quoteSelectors = rules['Quote']?.domSelectors || ['.OrganicUgcReviews-Text', '[class*="OrganicUgcReviews-Text"]'];
  const quoteEl = queryFirstMatch(cache, quoteSelectors);
  if (quoteEl) {
    const quoteText = quoteEl.textContent?.trim() || '';
    if (quoteText) {
      row['#QuoteText'] = quoteText;
      console.log(`✅ Найдена цитата: "${quoteText.substring(0, 50)}..."`);
    }
  }
  
  // #QuoteImage - изображение автора цитаты
  const quoteImageSelectors = rules['QuoteImage']?.domSelectors || ['.OrganicUgcReviews img', '[class*="OrganicUgcReviews"] img'];
  const quoteImageEl = queryFirstMatch(cache, quoteImageSelectors);
  if (quoteImageEl) {
    const src = quoteImageEl.getAttribute('src') || quoteImageEl.getAttribute('data-src');
    if (src) {
      row['#QuoteImage'] = src.startsWith('http') ? src : `https:${src}`;
    }
  }
  
  // #Sitelinks - ссылки на страницы сайта (для ESnippet)
  const sitelinksSelectors = rules['Sitelinks']?.domSelectors || ['.Sitelinks', '[class*="Sitelinks"]'];
  const sitelinksContainer = queryFirstMatch(cache, sitelinksSelectors);
  if (sitelinksContainer) {
    row['#Sitelinks'] = 'true';
    
    // Извлекаем отдельные ссылки
    const sitelinkItemSelectors = rules['Sitelinks-Item']?.domSelectors || ['.Sitelinks-Title', '[class*="Sitelinks-Title"]'];
    const sitelinkItems = queryAllFromCache(cache, sitelinkItemSelectors[0]);
    const sitelinks: string[] = [];
    
    for (let i = 0; i < sitelinkItems.length && i < 5; i++) {
      const linkText = sitelinkItems[i].textContent?.trim();
      if (linkText && !sitelinks.includes(linkText)) {
        sitelinks.push(linkText);
      }
    }
    
    for (let i = 0; i < sitelinks.length; i++) {
      row[`#Sitelinks-Item-${i + 1}`] = sitelinks[i];
    }
    row['#Sitelinks-Count'] = String(sitelinks.length);
    
    if (sitelinks.length > 0) {
      console.log(`✅ Найдены сайтлинки (${sitelinks.length}): ${sitelinks.join(', ')}`);
    }
  } else {
    row['#Sitelinks'] = 'false';
    row['#Sitelinks-Count'] = '0';
  }
  
  // #Phone - телефон (для ESnippet)
  const phoneSelectors = rules['Phone']?.domSelectors || ['.CoveredPhone', '[class*="CoveredPhone"]'];
  const phoneEl = queryFirstMatch(cache, phoneSelectors);
  if (phoneEl) {
    const phoneText = phoneEl.textContent?.trim() || '';
    if (phoneText) {
      row['#Phone'] = phoneText;
      console.log(`✅ Найден телефон: "${phoneText}"`);
    }
  }
  
  // #PromoOffer - промо-предложение (для ESnippet)
  const promoSelectors = rules['PromoOffer']?.domSelectors || ['.PromoOffer', '[class*="PromoOffer"]'];
  const promoEl = queryFirstMatch(cache, promoSelectors);
  if (promoEl) {
    const promoText = promoEl.textContent?.trim() || '';
    if (promoText) {
      row['#Promo'] = promoText;
      console.log(`✅ Найден промо-текст: "${promoText.substring(0, 50)}..."`);
    }
  }
  
  // #Address - адрес (для ESnippet)
  const addressSelectors = rules['Address']?.domSelectors || ['.Organic-Address', '[class*="Organic-Address"]'];
  const addressEl = queryFirstMatch(cache, addressSelectors);
  if (addressEl) {
    const addressText = addressEl.textContent?.trim() || '';
    if (addressText) {
      row['#Address'] = addressText;
      console.log(`✅ Найден адрес: "${addressText}"`);
    }
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
export function parseYandexSearchResults(html: string, fullMhtml?: string, parsingRules?: ParsingSchema): { rows: CSVRow[], error?: string } {
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
  // PHASE 5 OPTIMIZATION: Строим DOM кэш для каждого контейнера один раз
  const results: CSVRow[] = [];
  let spriteState: SpriteState | null = null;
  
  const domCacheStartTime = performance.now();
  for (const container of containers) {
    // Phase 5: Строим кэш элементов контейнера ОДИН РАЗ
    const containerCache = buildContainerCache(container);
    
    // Передаем CSS кэш, полный контент и DOM кэш контейнера
    const result = extractRowData(container, doc, spriteState, cssCache, fullMhtml || html, containerCache, parsingRules);
    spriteState = result.spriteState; // Обновляем состояние спрайта
    if (result.row) {
      results.push(result.row);
    }
  }
  const domCacheTime = performance.now() - domCacheStartTime;
  console.log(`✅ [DOM CACHE] Обработано ${containers.length} контейнеров за ${domCacheTime.toFixed(2)}ms`);
  
  // Дедуплицируем результаты
  const finalResults = deduplicateRows(results);
  console.log(`📊 Дедупликация: ${results.length} → ${finalResults.length} уникальных строк`);
  
  return { rows: finalResults };
  } catch (e) {
    console.error('Error in parseYandexSearchResults:', e);
    return { rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}

