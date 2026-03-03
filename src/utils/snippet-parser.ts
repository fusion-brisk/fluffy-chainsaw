// Snippet parsing utilities for Yandex search results

import { CSVRow } from '../types';
import type { WizardPayload, WizardComponent, WizardSpan, WizardFootnote, WizardListItem } from '../types/wizard-types';
import { Logger } from '../logger';
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
import { getSnippetType } from './yandex-shared';
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

/**
 * Извлекает текст заголовка, исключая вложенные Path/greenurl элементы.
 * На touch SERP заголовок и greenurl могут быть внутри одного элемента.
 * Sync: extension/content.js → getTitleTextClean
 */
function getTitleTextClean(el: Element): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as Element;
  const pathEls = clone.querySelectorAll(
    '.Path, .OrganicTitle-Path, .Organic-Path, .OrganicUrl, .Favicon, [class*="GreenUrl"], [class*="greenurl"]'
  );
  for (let i = 0; i < pathEls.length; i++) {
    pathEls[i].remove();
  }
  const text = (clone.textContent || '').trim().replace(/\s+/g, ' ');
  return text;
}

/**
 * Определяет платформу по HTML контенту (local copy to avoid circular imports)
 * @returns 'touch' | 'desktop'
 */
function detectPlatformFromHtmlContent(htmlContent: string): 'touch' | 'desktop' {
  // Надёжные эвристики — проверяем touch ПЕРВЫМ (HeaderPhone более специфичен)
  const hasHeaderPhone = htmlContent.includes('class="HeaderPhone"');
  const hasHeaderDesktop = htmlContent.includes('class="HeaderDesktop');
  
  // Touch проверяем первым — если есть HeaderPhone, это точно touch
  if (hasHeaderPhone) {
    Logger.debug('[detectPlatform] → touch (HeaderPhone найден)');
    return 'touch';
  }
  
  // Проверяем платформу по классам body
  if (htmlContent.includes('i-ua_platform_ios') || htmlContent.includes('i-ua_platform_android')) {
    Logger.debug('[detectPlatform] → touch (i-ua_platform_*)');
    return 'touch';
  }
  
  // Проверяем наличие touch-phone модификаторов
  if (htmlContent.includes('@touch-phone')) {
    Logger.debug('[detectPlatform] → touch (@touch-phone modifier)');
    return 'touch';
  }
  
  // Desktop — если есть HeaderDesktop
  if (hasHeaderDesktop) {
    Logger.debug('[detectPlatform] → desktop (HeaderDesktop найден)');
    return 'desktop';
  }
  
  // По умолчанию — desktop
  Logger.debug('[detectPlatform] → desktop (по умолчанию)');
  return 'desktop';
}

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
  parsingRules: ParsingSchema = DEFAULT_PARSING_RULES,
  platform: 'desktop' | 'touch' = 'desktop'
): { row: CSVRow | null; spriteState: SpriteState | null } {
    // Phase 5: Строим кэш элементов контейнера, если не передан
    const cache = containerCache || buildContainerCache(container);
    const rules = parsingRules.rules;
    const isTouch = platform === 'touch';
    
    // Определяем рекламные сниппеты (НЕ пропускаем, а помечаем флагами)
    // ОПТИМИЗИРОВАНО: используем кэш вместо querySelector
    const hasAdvLabel = queryFromCache(cache, '.Organic-Label_type_advertisement') ||
                        queryFromCache(cache, '.Organic-Subtitle_type_advertisement') ||
                        queryFromCache(cache, '.AdvLabel') ||  // "Промо" лейбл
                        queryFromCache(cache, '.OrganicAdvLabel');
    
    // Проверяем класс контейнера на наличие рекламной метки
    const isAdvContainer = container.className.includes('Organic_withAdvLabel') ||
                           container.className.includes('_withAdvLabel');
    
    // Проверяем AdvProductGalleryCard — рекламные карточки товаров
    const isAdvGalleryCard = container.classList.contains('AdvProductGalleryCard') ||
                             container.className.includes('AdvProductGalleryCard') ||
                             container.closest('.AdvProductGalleryCard') !== null ||
                             container.closest('[class*="AdvProductGalleryCard"]') !== null;
    
    // Флаги рекламы (устанавливаются позже в row)
    const isAdvProductGallery = isInsideAdvProductGallery(container) || 
        container.closest('.AdvProductGallery') !== null || 
        container.closest('[class*="AdvProductGallery"]') !== null ||
        isAdvGalleryCard;
    const isPromoSnippet = isAdvContainer || hasAdvLabel;
    
    if (isAdvProductGallery || isPromoSnippet) {
      Logger.debug('📢 Рекламный сниппет обнаружен, парсим с флагом');
    }
    
  
  // Определяем тип сниппета (единая логика из yandex-shared.ts)
  const containerClassName = container.className || '';
  const snippetTypeValue = getSnippetType(
    containerClassName,
    (selector: string) => !!container.querySelector(selector)
  );
  
  // === ИЗВЛЕЧЕНИЕ #serpItemId и #containerType для группировки ===
  // Ищем родительский <li data-cid="..."> для группировки сниппетов
  let serpItemId = '';
  let containerType = '';
  let parentLi: Element | null = container;
  
  // Поднимаемся по DOM до <li data-cid="...">
  while (parentLi && parentLi.tagName !== 'LI') {
    parentLi = parentLi.parentElement;
  }
  
  if (parentLi) {
    const dataCid = parentLi.getAttribute('data-cid');
    if (dataCid) {
      serpItemId = dataCid;
      Logger.debug(`🔗 [PARSE] serpItemId=${serpItemId} для "${snippetTypeValue}"`);
    }
  }
  
  // Определяем containerType по родительским элементам
  let searchParent: Element | null = container.parentElement;
  while (searchParent && !containerType) {
    const className = searchParent.className || '';
    
    // Проверяем типы контейнеров (от более специфичных к общим)
    if (className.includes('AdvProductGallery')) {
      containerType = 'AdvProductGallery';
    } else if (className.includes('ProductsTiles') || 
               className.includes('ProductsModeTiles') ||
               className.includes('ProductsModeRoot')) {
      // ProductsTiles / ProductsModeTiles / ProductsModeRoot — группа товаров
      containerType = 'ProductsTiles';
    } else if (className.includes('EShopGroup')) {
      containerType = 'EShopGroup';
    } else if (className.includes('EOfferGroup')) {
      containerType = 'EOfferGroup';
    } else if (className.includes('EntityOffers')) {
      containerType = 'EntityOffers';
    } else if (className.includes('ImagesIdeasGrid') || className.includes('ImagesGridImages')) {
      containerType = 'ImagesGrid';
    } else if (className.includes('ProductTileRow')) {
      containerType = 'ProductTileRow';
    }
    
    // Также проверяем data-fast-name на родительском li.serp-item
    if (!containerType && searchParent.tagName === 'LI' && 
        searchParent.classList.contains('serp-item')) {
      const fastName = searchParent.getAttribute('data-fast-name') || '';
      const fastSubtype = searchParent.getAttribute('data-fast-subtype') || '';
      
      if (fastName === 'images_ideas') {
        // images_ideas + grid subtype → ImagesIdeasGrid (justified grid)
        containerType = 'ImagesGrid';
        Logger.debug('📦 [PARSE] containerType=ImagesGrid (from data-fast-name=images_ideas)');
      } else if (fastName === 'products_mode_constr' ||
          fastSubtype.includes('ecommerce_offers') ||
          fastSubtype.includes('products_tiles')) {
        // ВАЖНО: products_mode_constr может содержать как EProductSnippet2 (плитки), 
        // так и EShopItem (список магазинов). Определяем по типу сниппета!
        if (snippetTypeValue === 'EShopItem') {
          containerType = 'EShopList';
          Logger.debug(`📦 [PARSE] containerType=EShopList (EShopItem в products_mode)`);
        } else {
          containerType = 'ProductsTiles';
          Logger.debug(`📦 [PARSE] containerType=ProductsTiles (from data-fast-name/subtype)`);
        }
      }
    }
    
    searchParent = searchParent.parentElement;
  }
  
  // Fallback: определяем containerType по типу сниппета
  if (!containerType) {
    switch (snippetTypeValue) {
      case 'EProductSnippet2':
        containerType = 'ProductsTiles';
        break;
      case 'EShopItem':
        containerType = 'EShopList';
        break;
      case 'EOfferItem':
        containerType = 'EOfferList';
        break;
      case 'Organic_withOfferInfo':
      case 'Organic':
        containerType = 'OrganicList';
        break;
    }
  }
  
  if (containerType) {
    Logger.debug(`📦 [PARSE] containerType=${containerType} для "${snippetTypeValue}"`);
  }
  
  // Извлекаем заголовок группы для EShopList
  let shopListTitle = '';
  if (containerType === 'EShopList') {
    // Ищем заголовок в родительских элементах
    let titleSearchParent: Element | null = container;
    while (titleSearchParent && !shopListTitle) {
      // Пробуем найти заголовок в текущем контейнере
      const titleSelectors = [
        '.DebrandingTitle-Text',
        '.GoodsHeader h2',
        '.Products-Title h2',
        '.EntitySearchTitle',
        '.ProductsTiles h2'
      ];
      for (const selector of titleSelectors) {
        const titleEl = titleSearchParent.querySelector(selector);
        if (titleEl && titleEl.textContent) {
          shopListTitle = titleEl.textContent.trim();
          Logger.debug(`📝 [PARSE] EShopListTitle="${shopListTitle}" (${selector})`);
          break;
        }
      }
      // Если это li.serp-item — прекращаем поиск
      if (titleSearchParent.tagName === 'LI' && 
          titleSearchParent.classList.contains('serp-item')) {
        break;
      }
      titleSearchParent = titleSearchParent.parentElement;
    }
    // Fallback
    if (!shopListTitle) {
      shopListTitle = 'Цены в магазинах';
    }
  }
  
  // === ImagesGrid — блок «Картинки» (ранний возврат) ===
  if (containerType === 'ImagesGrid') {
    const gridImages: Array<{url: string; width: number; height: number; row: number}> = [];
    const gridRows = container.querySelectorAll('.ImagesGridJustifier-Row');
    gridRows.forEach((gridRow: Element, rowIndex: number) => {
      const imgs = gridRow.querySelectorAll('img.Thumb-Image, .ImagesGridImages-Image img');
      imgs.forEach((img: Element) => {
        const src = img.getAttribute('src') || '';
        gridImages.push({
          url: src.indexOf('//') === 0 ? 'https:' + src : src,
          width: parseFloat(img.getAttribute('width') || '150'),
          height: parseFloat(img.getAttribute('height') || '150'),
          row: rowIndex
        });
      });
    });
    const titleEl = container.querySelector('.UniSearchHeader-TitleText');
    const gridTitle = titleEl ? (titleEl.textContent || '').trim() : 'Картинки';
    Logger.debug(`📷 [ImagesGrid] ${gridImages.length} картинок в ${gridRows.length} рядах`);
    return {
      '#SnippetType': 'ImagesGrid',
      '#containerType': 'ImagesGrid',
      '#serpItemId': serpItemId,
      '#ImagesGrid_title': gridTitle,
      '#ImagesGrid_data': JSON.stringify(gridImages),
      '#ImagesGrid_count': String(gridImages.length)
    } as CSVRow;
  }

  // Organic_Adv → ESnippet with isPromo=true (matching content.js behavior)
  const effectiveSnippetType = snippetTypeValue === 'Organic_Adv' ? 'ESnippet' : snippetTypeValue;
  const isOrgAdvPromo = snippetTypeValue === 'Organic_Adv' || isPromoSnippet;

  const row: CSVRow = {
    '#SnippetType': effectiveSnippetType,
    '#serpItemId': serpItemId,
    '#containerType': containerType,
    '#EShopListTitle': shopListTitle,
    '#isAdv': isAdvProductGallery ? 'true' : undefined,     // AdvProductGallery карточки
    '#isPromo': isOrgAdvPromo ? 'true' : undefined,         // Organic с рекламным лейблом
    '#query': '',
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
    '#ShopInfo-Ugc': '',
    '#ReviewsNumber': '',
    '#EReviews_shopText': '',
    '#ProductRating': '',
    '#LabelsList': '',
    '#DeliveryList': '',
    '#FintechList': '',
    '#QuoteImage': '',
    '#QuoteText': '',
    '#EQuote-Text': '',
    '#EQuote-AuthorAvatar': '',
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
      // ВАЖНО: для EProductSnippet2 ссылка ведёт на Яндекс Маркет, а не на магазин!
      // Не используем hostname из этой ссылки как OrganicHost
      const snippetClass = container.className || '';
      const isMarketSnippet = snippetClass.includes('EProductSnippet2') || 
                              snippetClass.includes('EShopItem') ||
                              u.hostname.includes('market.yandex') ||
                              u.hostname.includes('ya.ru');
      if (!isMarketSnippet) {
        row['#OrganicHost'] = u.hostname;
      }
    } catch (e) {
      // ignore
    }
  }
  
  // #OrganicTitle — ОПТИМИЗИРОВАНО (Phase 5): queryFirstMatch вместо querySelector
  const snippetType = row['#SnippetType'];
  
  // === СПЕЦИАЛЬНАЯ ОБРАБОТКА ДЛЯ EOfferItem ===
  // EOfferItem — карточка предложения магазина в попапе "Цены в магазинах"
  if (snippetType === 'EOfferItem') {
    // Извлекаем данные из EOfferItem используя специальные селекторы
    const eofferRules = rules;
    
    // #OrganicTitle — для EOfferItem это может быть название товара (если есть отдельный title)
    const offerTitleEl = queryFirstMatch(cache, eofferRules['EOfferItem_Title']?.domSelectors || ['.EOfferItem-Title']);
    if (offerTitleEl) {
      row['#OrganicTitle'] = getTextContent(offerTitleEl);
    }
    
    // #ShopName — название магазина
    const offerShopEl = queryFirstMatch(cache, eofferRules['EOfferItem_ShopName']?.domSelectors || ['.EOfferItem-ShopName']);
    if (offerShopEl) {
      row['#ShopName'] = getTextContent(offerShopEl);
      row['#OrganicHost'] = row['#ShopName']; // Для EOfferItem магазин = хост
    }
    
    // #OrganicPrice — цена из EOfferItem
    const offerPriceEl = queryFirstMatch(cache, eofferRules['EOfferItem_Price']?.domSelectors || ['.EOfferItem .EPrice-Value']);
    if (offerPriceEl) {
      const priceText = offerPriceEl.textContent?.trim() || '';
      const priceDigits = priceText.replace(PRICE_DIGITS_REGEX, '');
      if (priceDigits.length >= 1) {
        row['#OrganicPrice'] = formatPriceWithThinSpace(priceDigits);
        row['#Currency'] = '₽'; // Яндекс Маркет всегда в рублях
      }
    }
    
    // #ReviewsNumber — отзывы/рейтинг магазина
    const offerReviewsEl = queryFirstMatch(cache, eofferRules['EOfferItem_Reviews']?.domSelectors || ['.EOfferItem-Reviews']);
    if (offerReviewsEl) {
      const reviewsText = getTextContent(offerReviewsEl);
      row['#ReviewsNumber'] = reviewsText;
      // Пробуем извлечь рейтинг из текста (формат "4.8 · 1234 отзыва")
      const ratingMatch = reviewsText.match(RATING_REGEX);
      if (ratingMatch) {
        row['#ShopRating'] = ratingMatch[1];
      }
    }
    
    // #DeliveryList — условия доставки
    const offerDeliveryEl = queryFirstMatch(cache, eofferRules['EOfferItem_Delivery']?.domSelectors || ['.EOfferItem-Deliveries']);
    if (offerDeliveryEl) {
      row['#DeliveryList'] = getTextContent(offerDeliveryEl);
    }
    
    // #BUTTON и #ButtonView — кнопка "Купить" / "В магазин"
    // EOfferItem: красная кнопка → primaryShort, белая кнопка → white
    const offerButtonEl = queryFirstMatch(cache, eofferRules['EOfferItem_Button']?.domSelectors || ['.EOfferItem-Button']);
    if (offerButtonEl) {
      row['#BUTTON'] = 'true';
      const btnClasses = offerButtonEl.className || '';
      const href = offerButtonEl.getAttribute('href') || '';
      
      // Проверяем тип кнопки по классам и href
      const isCheckoutButton = btnClasses.includes('Button_view_primary') || 
                               href.includes('/cart') || 
                               href.includes('/express');
      const isWhiteButton = btnClasses.includes('Button_view_white');
      
      if (isCheckoutButton) {
        row['#ButtonView'] = 'primaryShort';
        row['#ButtonType'] = 'checkout';
        Logger.debug(`✅ [EOfferItem] Красная кнопка чекаута → ButtonView='primaryShort' для "${row['#ShopName']}"`);
      } else if (isWhiteButton) {
        row['#ButtonView'] = 'white';
        row['#ButtonType'] = 'shop';
        Logger.debug(`✅ [EOfferItem] Белая кнопка "В магазин" → ButtonView='white' для "${row['#ShopName']}"`);
      } else {
        // Fallback: если не определили тип, считаем белой кнопкой
        row['#ButtonView'] = 'white';
        row['#ButtonType'] = 'shop';
        Logger.debug(`✅ [EOfferItem] Кнопка (fallback) → ButtonView='white' для "${row['#ShopName']}"`);
      }
    } else {
      // ВАЖНО: В EOfferItem кнопка должна быть всегда (по требованиям к Figma компоненту).
      // Если не нашли элемент кнопки в DOM — всё равно включаем кнопку с дефолтным view=white.
      row['#BUTTON'] = 'true';
      row['#ButtonView'] = 'white';
      row['#ButtonType'] = 'shop';
    }
    
    // EPriceBarometer — барометр цен (определяем view)
    // Поддерживаем оба формата классов: EPriceBarometer_type_X и EPriceBarometer-X
    const barometerEl = queryFirstMatch(cache, eofferRules['EPriceBarometer']?.domSelectors || ['.EPriceBarometer']);
    if (barometerEl) {
      row['#ELabelGroup_Barometer'] = 'true';
      const barometerClasses = barometerEl.className || '';
      if (barometerClasses.includes('below-market') || barometerClasses.includes('EPriceBarometer-Cheap')) {
        row['#EPriceBarometer_View'] = 'below-market';
      } else if (barometerClasses.includes('in-market') || barometerClasses.includes('EPriceBarometer-Average')) {
        row['#EPriceBarometer_View'] = 'in-market';
      } else if (barometerClasses.includes('above-market') || barometerClasses.includes('EPriceBarometer-Expensive')) {
        row['#EPriceBarometer_View'] = 'above-market';
      }
      Logger.debug(`✅ Найден EPriceBarometer в EOfferItem: view="${row['#EPriceBarometer_View']}"`);
    }
    
    // Модификаторы EOfferItem (для Figma Variant Properties)
    if (container.classList.contains('EOfferItem_defaultOffer') || container.className.includes('EOfferItem_defaultOffer')) {
      row['#EOfferItem_defaultOffer'] = 'true';
    }
    if (container.classList.contains('EOfferItem_button') || container.className.includes('EOfferItem_button')) {
      row['#EOfferItem_hasButton'] = 'true';
    }
    if (container.classList.contains('EOfferItem_reviews') || container.className.includes('EOfferItem_reviews')) {
      row['#EOfferItem_hasReviews'] = 'true';
    }
    if (container.classList.contains('EOfferItem_delivery') || container.className.includes('EOfferItem_delivery')) {
      row['#EOfferItem_hasDelivery'] = 'true';
    }
    
    // Валидация: для EOfferItem требуем хотя бы магазин
    if (!row['#ShopName']) {
      Logger.debug('⚠️ Пропущен EOfferItem без названия магазина');
      return { row: null, spriteState: spriteState };
    }
    
    // Для EOfferItem используем ShopName как Title если Title пустой
    if (!row['#OrganicTitle'] && row['#ShopName']) {
      row['#OrganicTitle'] = row['#ShopName'];
    }
    
    Logger.debug(`✅ Извлечен EOfferItem: магазин="${row['#ShopName']}", цена="${row['#OrganicPrice']}", кнопка=${row['#BUTTON']}`);
    return { row: row, spriteState: spriteState };
  }
  
  // === СТАНДАРТНАЯ ОБРАБОТКА ДЛЯ ДРУГИХ ТИПОВ СНИППЕТОВ ===
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
    // Use getTitleTextClean to strip Path/greenurl children that appear
    // inside the title element on touch SERP (sync with extension/content.js)
    row['#OrganicTitle'] = getTitleTextClean(titleEl);
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
  } else if (snippetType === 'Organic_withOfferInfo' || snippetType === 'Organic') {
    // Для Organic_withOfferInfo: извлекаем из .Path (первая часть до ›)
    const pathEl = queryFirstMatch(cache, ['.Path', '[class*="Path"]']);
    if (pathEl) {
      const pathText = getTextContent(pathEl);
      // Формат: "domain.ru›category/path..." — берём только домен
      const separator = pathText.indexOf('›');
      const shopName = separator > 0 ? pathText.substring(0, separator).trim() : pathText.trim();
      row['#ShopName'] = shopName;
      // Также ставим OrganicHost если ещё не установлен
      if (!row['#OrganicHost']) {
        row['#OrganicHost'] = shopName;
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
  
  // === FALLBACK для #OrganicHost если ещё не установлен ===
  if (!row['#OrganicHost'] || row['#OrganicHost'].trim() === '') {
    // 1. Из href ссылки .Path-Item
    const pathItemLink = container.querySelector('.Path-Item[href], [class*="Path-Item"][href], a.path__item[href]') as HTMLAnchorElement | null;
    if (pathItemLink && pathItemLink.href) {
      try {
        const u = new URL(pathItemLink.href);
        row['#OrganicHost'] = u.hostname.replace(/^www\./, '');
        Logger.debug(`✅ [OrganicHost] Извлечён из Path-Item href: ${row['#OrganicHost']}`);
      } catch (e) {
        // ignore
      }
    }
    
    // 2. Из текста <b> внутри Path (обычно содержит домен)
    if (!row['#OrganicHost'] || row['#OrganicHost'].trim() === '') {
      const pathBold = container.querySelector('.Path b, .Path-Item b, .path__item b');
      if (pathBold) {
        const boldText = pathBold.textContent?.trim() || '';
        // Проверяем что это похоже на домен (содержит точку)
        if (boldText && boldText.includes('.') && !boldText.includes(' ')) {
          row['#OrganicHost'] = boldText.replace(/^www\./, '');
          Logger.debug(`✅ [OrganicHost] Извлечён из Path <b>: ${row['#OrganicHost']}`);
        }
      }
    }
    
    // 3. Из любой внешней ссылки в сниппете (кроме yandex.ru)
    if (!row['#OrganicHost'] || row['#OrganicHost'].trim() === '') {
      const externalLinks = container.querySelectorAll('a[href^="http"]');
      for (let i = 0; i < externalLinks.length; i++) {
        const link = externalLinks[i] as HTMLAnchorElement;
        try {
          const u = new URL(link.href);
          // Пропускаем яндексовые домены
          if (!u.hostname.includes('yandex') && !u.hostname.includes('yastatic')) {
            row['#OrganicHost'] = u.hostname.replace(/^www\./, '');
            Logger.debug(`✅ [OrganicHost] Извлечён из внешней ссылки: ${row['#OrganicHost']}`);
            break;
          }
        } catch (e) {
          // ignore
        }
      }
    }
    
    // 4. Последний fallback — из ShopName если он похож на домен
    if (!row['#OrganicHost'] || row['#OrganicHost'].trim() === '') {
      const shopName = row['#ShopName'] || '';
      if (shopName.includes('.') && !shopName.includes(' ')) {
        row['#OrganicHost'] = shopName.replace(/^www\./, '');
        Logger.debug(`✅ [OrganicHost] Использован ShopName как домен: ${row['#OrganicHost']}`);
      }
    }
  }
  
  // #withThumb — наличие картинки в сниппете
  const hasThumbClass = (container.className || '').includes('Organic_withThumb') ||
                        (container.className || '').includes('_withThumb') ||
                        (container.className || '').includes('withOfferThumb');
  const hasThumbImage = queryFirstMatch(cache, ['.Organic-OfferThumb img', '.Organic-Thumb img', '.EThumb img', '[class*="Thumb"] img']);
  row['#withThumb'] = (hasThumbClass || hasThumbImage) ? 'true' : 'false';
  
  // #isVerified / #VerifiedType — badge "Сайт специализируется на продаже товаров"
  const verifiedEl = queryFirstMatch(cache, ['.Verified_type_goods', '.Verified']);
  if (verifiedEl) {
    row['#VerifiedType'] = 'goods';
    row['#isVerified'] = 'true';
  } else {
    row['#isVerified'] = 'false';
  }
  
  // #OfficialShop — проверяем наличие метки официального магазина внутри EShopName
  const officialShopSelectors = rules['OfficialShop']?.domSelectors || ['.EShopName .OfficialShop', '[class*="EShopName"] .OfficialShop'];
  const officialShop = queryFirstMatch(cache, officialShopSelectors);
  if (officialShop) {
    row['#OfficialShop'] = 'true';
    Logger.debug(`✅ Найден OfficialShop в сниппете "${row['#OrganicTitle']?.substring(0, 30)}..." (магазин: ${row['#ShopName']})`);
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
  Logger.debug(`🔍 [PARSE] После extractFavicon: row['#FaviconImage']="${row['#FaviconImage'] || '(пусто)'}"`);
  
  // #OrganicText — ОПТИМИЗИРОВАНО (Phase 5)
  const textContent = queryFirstMatch(cache, rules['#OrganicText'].domSelectors);
  if (textContent) {
    row['#OrganicText'] = getTextContent(textContent);
  }

  // Fallback: если для EShopItem / Organic не пришёл #OrganicText — подставляем #OrganicTitle
  // (чтобы не было пустых блоков текста в макете).
  const organicText = (row['#OrganicText'] || '').trim();
  const organicTitle = (row['#OrganicTitle'] || '').trim();
  if (!organicText && organicTitle) {
    if (
      snippetType === 'EShopItem' ||
      snippetType === 'Organic' ||
      snippetType === 'Organic_withOfferInfo' ||
      snippetType === 'ESnippet' ||
      snippetType === 'Snippet'
    ) {
      row['#OrganicText'] = organicTitle;
    }
  }
  
  // #OrganicImage — ОПТИМИЗИРОВАНО (Phase 5)
  const image = queryFirstMatch(cache, rules['#OrganicImage'].domSelectors);
  if (image) {
    let src = image.getAttribute('src') || image.getAttribute('data-src') || image.getAttribute('srcset');
    if (src && src.includes(' ')) {
      src = src.split(',')[0].trim().split(' ')[0];
    }
    if (src) row['#OrganicImage'] = (src.startsWith('http') || src.startsWith('data:')) ? src : `https:${src}`;
  }
  
  // #ThumbImage
  row['#ThumbImage'] = row['#OrganicImage'];
  
  // EThumbGroup — группа картинок (коллаж)
  // Используется для:
  // 1. Каталожных страниц (без цены) — #isCatalogPage=true
  // 2. Товарных карточек с коллажем (с ценой) — #isCatalogPage=false, но imageType=EThumbGroup
  const thumbGroup = queryFirstMatch(cache, ['.EThumbGroup', '[class*="EThumbGroup"]']);
  if (thumbGroup) {
    Logger.debug(`🔍 [EThumbGroup] Найден элемент, извлекаем картинки...`);
    const thumbImages = thumbGroup.querySelectorAll('.EThumb-Image, img[class*="EThumb"]');
    const images: string[] = [];
    
    thumbImages.forEach((img) => {
      let src = img.getAttribute('src') || img.getAttribute('data-src');
      if (src) {
        src = (src.startsWith('http') || src.startsWith('data:')) ? src : `https:${src}`;
        images.push(src);
      }
    });
    
    Logger.debug(`🔍 [EThumbGroup] Найдено ${images.length} картинок`);
    
    if (images.length > 1) {
      // Есть несколько картинок — используем EThumbGroup
      row['#imageType'] = 'EThumbGroup';
      row['#Image1'] = images[0] || '';
      row['#Image2'] = images[1] || '';
      row['#Image3'] = images[2] || '';
      row['#ThumbGroupCount'] = String(images.length);
      
      // Проверяем наличие цены — если есть EPriceGroup, это товар, а не каталог
      const hasPrice = queryFirstMatch(cache, ['.EPriceGroup', '[class*="EPriceGroup"]', '.EPrice', '[class*="EPrice-Value"]']);
      if (!hasPrice) {
        // Нет цены — это страница каталога
        row['#isCatalogPage'] = 'true';
        row['#TargetSnippetType'] = 'ESnippet';
        row['#hidePriceBlock'] = 'true';
        Logger.debug(`✅ [EThumbGroup] Каталог: ${images.length} картинок, без цены`);
      } else {
        // Есть цена — это товар с коллажем
        row['#isCatalogPage'] = 'false';
        Logger.debug(`✅ [EThumbGroup] Товар с коллажем: ${images.length} картинок, ЕСТЬ цена`);
      }
    } else if (images.length === 1) {
      // Одна картинка — используем EThumb
      row['#imageType'] = 'EThumb';
      row['#OrganicImage'] = images[0];
      row['#ThumbImage'] = images[0];
      Logger.debug(`🔍 [EThumbGroup] Только 1 картинка → EThumb`);
    } else {
      row['#imageType'] = 'EThumb';
      Logger.debug(`🔍 [EThumbGroup] Нет картинок → EThumb`);
    }
  } else {
    // Нет EThumbGroup — используем обычный EThumb
    row['#imageType'] = 'EThumb';
  }

  // Проверяем наличие EPriceGroup-Pair или EPriceGroup_withLabelDiscount (специальная обработка для цен с скидкой)
  // ОПТИМИЗИРОВАНО (Phase 5)
  const priceGroupPair = queryFirstMatch(cache, rules['EPriceGroup_Pair'].domSelectors);
  // Также проверяем EPriceGroup с классом withLabelDiscount (Organic_withOfferInfo сниппеты)
  const hasLabelDiscount = container.className.includes('EPriceGroup_withLabelDiscount') || 
                           queryFromCache(cache, '[class*="EPriceGroup_withLabelDiscount"]') !== null;
  const hasSpecialPriceLogic = priceGroupPair || hasLabelDiscount;
  
  if (hasSpecialPriceLogic) {
    Logger.debug(`✅ Найден ${priceGroupPair ? 'EPriceGroup-Pair' : 'EPriceGroup_withLabelDiscount'}, обрабатываем специальную логику цен`);
    
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
          Logger.debug(`✅ Извлечена текущая цена из EPriceGroup-Price: ${formattedPrice}`);
        }
      }
    }
    
    // 3. Извлекаем #OldPrice из блока с классом EPrice_view_old
    // Ищем конкретно .EPrice-Value внутри .EPrice_view_old, чтобы избежать дублирования
    // ИСПРАВЛЕНИЕ: используем container как fallback когда priceGroupPair не существует
    const searchContext = priceGroupPair || container;
    const oldPriceEl = queryFirstMatch(cache, rules['EPrice_Old'].domSelectors) ||
                       searchContext.querySelector('.EPrice_view_old .EPrice-Value, [class*="EPrice_view_old"] .EPrice-Value, .EPrice_view_old [class*="EPrice-Value"]');
                       
    if (oldPriceEl) {
      const oldPriceText = oldPriceEl.textContent?.trim() || '';
      // Очищаем значение цены (убираем все кроме цифр)
      const oldPriceDigits = oldPriceText.replace(PRICE_DIGITS_REGEX, '');
      if (oldPriceDigits.length >= 1) {
        // Форматируем цену с математическим пробелом
        const formattedOldPrice = formatPriceWithThinSpace(oldPriceDigits);
        row['#OldPrice'] = formattedOldPrice;
        row['#EPriceGroup_OldPrice'] = 'true';  // ← Только если есть данные
        Logger.debug(`✅ Извлечена старая цена из EPrice-Value: ${formattedOldPrice}`);
      }
    } else {
      // Fallback: если не нашли .EPrice-Value, пробуем весь элемент
      const oldPriceElFallback = searchContext.querySelector('.EPrice_view_old, [class*="EPrice_view_old"]');
      if (oldPriceElFallback) {
        const oldPriceText = oldPriceElFallback.textContent?.trim() || '';
        const oldPriceDigits = oldPriceText.replace(PRICE_DIGITS_REGEX, '');
        if (oldPriceDigits.length >= 1) {
          // Форматируем цену с математическим пробелом
          const formattedOldPrice = formatPriceWithThinSpace(oldPriceDigits);
          row['#OldPrice'] = formattedOldPrice;
          row['#EPriceGroup_OldPrice'] = 'true';  // ← Только если есть данные
          Logger.debug(`✅ Извлечена старая цена из EPrice_view_old (fallback): ${formattedOldPrice}`);
        }
      }
    }
    
    // 4. Извлекаем #discount из блока с классом LabelDiscount
    // Ищем конкретно .Label-Content внутри .LabelDiscount, где находится текст скидки
    // ВАЖНО: используем searchContext (priceGroupPair || container), а не priceGroupPair напрямую!
    const discountContentEl = queryFirstMatch(cache, rules['LabelDiscount_Content'].domSelectors) ||
                              searchContext.querySelector('.LabelDiscount .Label-Content, [class*="LabelDiscount"] .Label-Content, .LabelDiscount [class*="Label-Content"]');
                              
    if (discountContentEl) {
      const discountText = discountContentEl.textContent?.trim() || '';
      // Извлекаем число из текста вида "−51%" или "–51%" (может быть минус U+2212 или дефис)
      // DISCOUNT_VALUE_REGEX теперь требует минус ИЛИ процент, чтобы не захватить цену
      const discountMatch = discountText.match(DISCOUNT_VALUE_REGEX);
      if (discountMatch) {
        // Группа 1: после минуса, Группа 2: перед процентом (без минуса)
        const rawValue = (discountMatch[1] || discountMatch[2] || '').trim();
        // Оставляем только цифры и пробелы, убираем запятые и другие символы
        const discountValue = rawValue.replace(/[^\d\s\u2009\u00A0]/g, '').trim();
        if (discountValue) {
          // Форматируем как "–{значение}%" (используем обычные пробелы, если были математические)
          const formattedDiscount = `–${discountValue.replace(/[\u2009\u00A0]/g, ' ')}%`;
          row['#discount'] = formattedDiscount;
          row['#EPriceGroup_Discount'] = 'true';  // ← Только если есть данные
          // Также сохраняем в DiscountPercent для совместимости
          const discountNumber = discountValue.replace(/\s/g, '');
          if (discountNumber) {
            row['#DiscountPercent'] = discountNumber;
          }
          Logger.debug(`✅ Извлечена скидка из Label-Content: ${formattedDiscount} (исходный текст: "${discountText}")`);
        } else {
          Logger.warn(`⚠️ Скидка не является числом: "${discountText}"`);
        }
      } else {
        // Текст не содержит скидку (например "ОК") — это нормально, не логируем как ошибку
        if (discountText && discountText !== 'ОК' && discountText !== 'OK') {
          Logger.warn(`⚠️ Не удалось извлечь скидку из Label-Content: "${discountText}"`);
        }
      }
    } else {
      // Fallback: если не нашли .Label-Content, пробуем весь элемент LabelDiscount
      // ВАЖНО: используем searchContext (priceGroupPair || container), а не priceGroupPair напрямую!
      const discountLabelEl = searchContext.querySelector('.LabelDiscount, [class*="LabelDiscount"]');
      if (discountLabelEl) {
        const discountText = discountLabelEl.textContent?.trim() || '';
        const discountMatch = discountText.match(DISCOUNT_VALUE_REGEX);
        if (discountMatch) {
          // Группа 1: после минуса, Группа 2: перед процентом (без минуса)
          const rawValue = (discountMatch[1] || discountMatch[2] || '').trim();
          const discountValue = rawValue.replace(/[^\d\s\u2009\u00A0]/g, '').trim();
          if (discountValue) {
            const formattedDiscount = `–${discountValue.replace(/[\u2009\u00A0]/g, ' ')}%`;
            row['#discount'] = formattedDiscount;
            row['#EPriceGroup_Discount'] = 'true';  // ← Только если есть данные
            const discountNumber = discountValue.replace(/\s/g, '');
            if (discountNumber) {
              row['#DiscountPercent'] = discountNumber;
            }
            Logger.debug(`✅ Извлечена скидка из LabelDiscount (fallback): ${formattedDiscount}`);
          }
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
      // ВАЖНО: устанавливаем флаг для Figma компонента
      row['#EPriceGroup_OldPrice'] = 'true';
      Logger.debug(`✅ Найдена старая цена (без EPriceGroup-Pair): ${prices.oldPrice}`);
    }
    
    // #DiscountPercent — ищем в LabelDiscount (ТОЧНЫЙ класс, не подстрока!)
    // ВАЖНО: НЕ используем [class*="LabelDiscount"] — он захватывает EPriceGroup_withLabelDiscount
    const discountLabel = container.querySelector('.LabelDiscount .Label-Content, .LabelDiscount.Label .Label-Content');
    if (discountLabel) {
      const discText = discountLabel.textContent?.trim() || '';
      const match = discText.match(DISCOUNT_PERCENT_REGEX);
      if (match) {
        row['#DiscountPercent'] = match[1];
        // ВАЖНО: устанавливаем флаг для Figma компонента
        row['#EPriceGroup_Discount'] = 'true';
        // Форматируем скидку для поля #discount
        row['#discount'] = `–${match[1]}%`;
        Logger.debug(`✅ Найдена скидка (без EPriceGroup-Pair): –${match[1]}%`);
      }
    }
    
    // Fallback: ищем скидку через селекторы из правил
    if (!row['#DiscountPercent']) {
      const discountAlt = queryFirstMatch(cache, rules['#DiscountPercent'].domSelectors) ||
                          container.querySelector('.Price-DiscountPercent, .EProductSnippet2-Discount');
      if (discountAlt) {
        // Проверяем, что это реально скидка (содержит %)
        const discText = discountAlt.textContent?.trim() || '';
        if (discText.includes('%')) {
          const match = discText.match(DISCOUNT_PERCENT_REGEX);
          if (match) {
            row['#DiscountPercent'] = match[1];
            row['#EPriceGroup_Discount'] = 'true';
            row['#discount'] = `–${match[1]}%`;
          }
        }
      }
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
  
  // #ShopInfo-Ugc — рейтинг магазина (например "4.8")
  // Парсим из разных контейнеров:
  // 1. OrganicUgcReviews-RatingContainer → RatingOneStar → Line-AddonContent
  // 2. EReviewsLabel (кнопка) → EReviewsLabel-Rating → Line-AddonContent
  // 3. EShopItemMeta-UgcLine → RatingOneStar → Line-AddonContent
  // 4. ShopInfo-Ugc (fallback)
  
  const shopRatingSelectors = [
    // OrganicUgcReviews — рейтинг магазина в блоке отзывов
    '.OrganicUgcReviews-RatingContainer .RatingOneStar .Line-AddonContent',
    '.OrganicUgcReviews .RatingOneStar .Line-AddonContent',
    '[class*="OrganicUgcReviews"] .RatingOneStar .Line-AddonContent',
    // EReviewsLabel — рейтинг в кнопке отзывов
    '.EReviewsLabel-Rating .Line-AddonContent',
    '.EReviewsLabel .RatingOneStar .Line-AddonContent',
    '[class*="EReviewsLabel"] .RatingOneStar .Line-AddonContent',
    // EShopItemMeta — рейтинг в метаданных магазина
    '.EShopItemMeta-UgcLine .RatingOneStar .Line-AddonContent',
    '.EShopItemMeta-ReviewsContainer .RatingOneStar .Line-AddonContent',
    '[class*="EShopItemMeta"] .RatingOneStar .Line-AddonContent',
    // ShopInfo-Ugc — рейтинг в блоке информации о магазине
    '.ShopInfo-Ugc .RatingOneStar .Line-AddonContent',
    '[class*="ShopInfo-Ugc"] .RatingOneStar .Line-AddonContent',
    // Fallback — любой RatingOneStar (но НЕ ELabelRating — это рейтинг товара!)
    '.RatingOneStar .Line-AddonContent',
    '[class*="RatingOneStar"] .Line-AddonContent'
  ];
  
  const shopRatingEl = queryFirstMatch(cache, shopRatingSelectors);
  if (shopRatingEl) {
    const ugcText = getTextContent(shopRatingEl).trim();
    // Достаём число вида 4.8 / 4,8 (рейтинг 0-5 с одним знаком после запятой)
    const ugcMatch = ugcText.match(/([0-5](?:[.,]\d)?)/);
    if (ugcMatch) {
      row['#ShopInfo-Ugc'] = ugcMatch[1].replace(',', '.');
      Logger.debug(`✅ [ShopInfo-Ugc] Рейтинг магазина: "${row['#ShopInfo-Ugc']}" (из: "${shopRatingEl.className}")`);
    }
  } else {
    // Fallback: ищем в контейнерах напрямую
    const shopInfoUgcFallback = queryFirstMatch(cache, ['.ShopInfo-Ugc', '[class*="ShopInfo-Ugc"]']);
    if (shopInfoUgcFallback) {
      const ugcText = getTextContent(shopInfoUgcFallback).trim();
      const ugcMatch = ugcText.match(/([0-5](?:[.,]\d)?)/);
      if (ugcMatch) {
        row['#ShopInfo-Ugc'] = ugcMatch[1].replace(',', '.');
        Logger.debug(`✅ [ShopInfo-Ugc] Рейтинг магазина (fallback): "${row['#ShopInfo-Ugc']}"`);
      }
    }
  }
  
  // #ReviewsNumber — ОПТИМИЗИРОВАНО (Phase 5)
  const reviews = queryFirstMatch(cache, rules['#ReviewsNumber'].domSelectors) ||
                  container.querySelector('[aria-label*="отзыв" i]');
  if (reviews) {
    const revText = reviews.textContent?.trim() || '';
    const match = revText.match(REVIEWS_REGEX);
    if (match) row['#ReviewsNumber'] = match[1].trim();
  }
  
  // #EReviews_shopText — текст отзывов магазина (например "62,8K отзывов на магазин")
  // Парсим из разных контейнеров и формируем полный текст:
  // 1. OrganicUgcReviews-Text → EReviews + EReviews-ShopText (полный формат: "62,8K отзывов на магазин")
  // 2. EReviewsLabel-Text → только число (формат: "5,1K отзывов"), нужно добавить "на магазин"
  // 3. EShopItemMeta-Reviews → Line-AddonContent (формат: "6,3K отзывов"), нужно добавить "на магазин"
  // 4. EReviews_shopText / EReviews-ShopText (legacy fallback)
  
  let shopReviewsText = '';
  
  // 1. Полный формат из OrganicUgcReviews-Text (содержит "на магазин")
  const organicUgcReviewsText = queryFirstMatch(cache, [
    '.OrganicUgcReviews-Text',
    '[class*="OrganicUgcReviews-Text"]'
  ]);
  if (organicUgcReviewsText) {
    // Извлекаем весь текст — он уже содержит "X отзывов на магазин"
    shopReviewsText = getTextContent(organicUgcReviewsText).trim();
    Logger.debug(`✅ [EReviews_shopText] Из OrganicUgcReviews-Text: "${shopReviewsText}"`);
  }
  
  // 2. EReviewsLabel-Text (кнопка с отзывами) — только число, добавляем "на магазин"
  if (!shopReviewsText) {
    const eReviewsLabelText = queryFirstMatch(cache, [
      '.EReviewsLabel-Text',
      '.EReviewsLabel .EReviews',
      '[class*="EReviewsLabel-Text"]',
      '[class*="EReviewsLabel"] .EReviews'
    ]);
    if (eReviewsLabelText) {
      const rawText = getTextContent(eReviewsLabelText).trim();
      // Формат: "5,1K отзывов" → "5,1K отзывов на магазин"
      if (rawText && rawText.toLowerCase().includes('отзыв')) {
        shopReviewsText = rawText.includes('магазин') ? rawText : `${rawText} на магазин`;
        Logger.debug(`✅ [EReviews_shopText] Из EReviewsLabel: "${shopReviewsText}"`);
      }
    }
  }
  
  // 3. EShopItemMeta-Reviews — число отзывов в метаданных
  if (!shopReviewsText) {
    const eShopItemMetaReviews = queryFirstMatch(cache, [
      '.EShopItemMeta-Reviews .Line-AddonContent',
      '[class*="EShopItemMeta-Reviews"] .Line-AddonContent',
      '.EShopItemMeta-Reviews',
      '[class*="EShopItemMeta-Reviews"]'
    ]);
    if (eShopItemMetaReviews) {
      const rawText = getTextContent(eShopItemMetaReviews).trim();
      if (rawText && rawText.toLowerCase().includes('отзыв')) {
        shopReviewsText = rawText.includes('магазин') ? rawText : `${rawText} на магазин`;
        Logger.debug(`✅ [EReviews_shopText] Из EShopItemMeta-Reviews: "${shopReviewsText}"`);
      }
    }
  }
  
  // 4. Legacy fallback: EReviews_shopText / EReviews-ShopText
  if (!shopReviewsText) {
    const legacyShopText = queryFirstMatch(cache, [
      '.EReviews_shopText',
      '.EReviews-ShopText',
      '[class*="EReviews_shopText"]',
      '[class*="EReviews-ShopText"]'
    ]);
    if (legacyShopText) {
      shopReviewsText = getTextContent(legacyShopText).trim();
      if (shopReviewsText) {
        Logger.debug(`✅ [EReviews_shopText] Из legacy EReviews-ShopText: "${shopReviewsText}"`);
      }
    }
  }
  
  if (shopReviewsText) {
    row['#EReviews_shopText'] = shopReviewsText;
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
  // ВАЖНО: исключаем LabelDiscount, который может иметь класс ELabelRating_size_*
  let labelRating = queryFirstMatch(cache, rules['#ProductRating'].domSelectors);
  
  // Если не нашли, пробуем найти через ТОЧНЫЙ класс .ELabelRating (не подстроку!)
  // ВАЖНО: НЕ используем [class*="ELabelRating"] или [class*="LabelRating"],
  // потому что LabelDiscount имеет класс ELabelRating_size_3xs (подстрока совпадает!)
  if (!labelRating) {
    labelRating = queryFirstMatch(cache, [
      '.ELabelRating:not(.LabelDiscount)',
      '.ELabelRating'
    ]);
  }
  
  // Дополнительная проверка: убедимся что найденный элемент НЕ является LabelDiscount
  if (labelRating) {
    const labelClasses = labelRating.className || '';
    if (labelClasses.includes('LabelDiscount')) {
      Logger.debug(`⚠️ Найденный ELabelRating является LabelDiscount, пропускаем`);
      labelRating = null;
    }
  }
  
  if (labelRating) {
    Logger.debug(`🔍 Найден ELabelRating в сниппете "${row['#OrganicTitle']?.substring(0, 30)}..."`);
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
          Logger.debug(`✅ Извлечен рейтинг из ELabelRating (прямой текст): "${validatedRating}" (исходный текст: "${ratingText.trim()}")`);
        } else {
          Logger.warn(`⚠️ Извлеченное значение не является валидным рейтингом: "${ratingText.trim()}" (ожидается число от 0 до 5)`);
        }
      }
    } else {
      const ratingText = getTextContent(labelContent);
      if (ratingText && ratingText.trim() !== '') {
        const validatedRating = validateRating(ratingText);
        if (validatedRating) {
          row['#ProductRating'] = validatedRating;
          Logger.debug(`✅ Извлечен рейтинг из ELabelRating: "${validatedRating}" (исходный текст: "${ratingText.trim()}")`);
        } else {
          Logger.warn(`⚠️ Извлеченное значение не является валидным рейтингом: "${ratingText.trim()}" (ожидается число от 0 до 5)`);
        }
      } else {
        Logger.debug(`⚠️ Label-Content найден, но пустой в ELabelRating`);
      }
    }
  } else {
    // Логируем только для первых нескольких сниппетов, чтобы не засорять логи
    const snippetIndex = (row['#OrganicTitle'] || '').length % 10;
    if (snippetIndex < 3) {
      Logger.debug(`⚠️ ELabelRating не найден в сниппете "${row['#OrganicTitle']?.substring(0, 30)}..."`);
    }
  }
  
  // #EMarketCheckoutLabel - проверяем наличие лейбла "Покупки" — ОПТИМИЗИРОВАНО (Phase 5)
  const marketCheckoutLabel = queryFirstMatch(cache, rules['EMarketCheckoutLabel']?.domSelectors || ['.EMarketCheckoutLabel', '[class*="EMarketCheckoutLabel"]']);
  if (marketCheckoutLabel) {
    Logger.debug(`✅ Найден EMarketCheckoutLabel в сниппете "${row['#OrganicTitle']?.substring(0, 30)}..."`);
    row['#EMarketCheckoutLabel'] = 'true';
  } else {
    row['#EMarketCheckoutLabel'] = 'false';
  }
  
  // #EDeliveryGroup - блок с вариантами доставки
  // Используем более специфичный селектор чтобы найти контейнер, а не Item
  const deliveryGroupSelectors = ['.EDeliveryGroup', '[class*="EDeliveryGroup"]:not([class*="EDeliveryGroup-Item"])'];
  const deliveryGroup = queryFirstMatch(cache, deliveryGroupSelectors);
  
  if (deliveryGroup) {
    // Выставим флаг позже: только если реально нашли >= 1 вид доставки
    
    // Извлекаем все EDeliveryGroup-Item ТОЛЬКО внутри найденного контейнера (чтобы не брать элементы из других мест страницы)
    const items = Array.prototype.slice.call(
      deliveryGroup.querySelectorAll('.EDeliveryGroup-Item, [class*="EDeliveryGroup-Item"]')
    ) as Element[];
    
    // Фильтруем скрытые элементы (A11yHidden) и собираем уникальные значения в DOM-порядке
    const deliveryItems: string[] = [];
    for (let i = 0; i < items.length && deliveryItems.length < 3; i++) {
      const item = items[i];
      // Пропускаем скрытые элементы (A11yHidden) — проверяем по цепочке родителей
      let p: Element | null = item;
      let hidden = false;
      while (p) {
        const cls = (p as any).className || '';
        if (typeof cls === 'string' && cls.indexOf('A11yHidden') !== -1) {
          hidden = true;
          break;
        }
        p = p.parentElement;
      }
      if (hidden) continue;
      
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
    
    row['#EDeliveryGroup'] = deliveryItems.length > 0 ? 'true' : 'false';
    Logger.debug(`✅ Найден EDeliveryGroup с ${deliveryItems.length} items: ${deliveryItems.join(', ')}`);
  } else {
    row['#EDeliveryGroup'] = 'false';
    row['#EDeliveryGroup-Count'] = '0';
  }
  
  // #EDelivery_abroad - признак доставки из-за границы (ECrossborderInfo / ShopInfo-Crossborder)
  const crossborderSelectors = ['.ECrossborderInfo', '.ShopInfo-Crossborder', '[class*="Crossborder"]'];
  const crossborderEl = queryFirstMatch(cache, crossborderSelectors);
  if (crossborderEl) {
    row['#EDelivery_abroad'] = 'true';
    Logger.debug(`✅ Найден Crossborder (доставка из-за границы)`);
  } else {
    row['#EDelivery_abroad'] = 'false';
  }

  // ShopInfo-Bnpl - BNPL иконки/лейблы в сниппете (используются для управления инстансами внутри #ShopInfo-Bnpl)
  // Также проверяем Organic-Bnpl для ESnippet-типов
  const shopInfoBnplEl = queryFirstMatch(cache, ['.ShopInfo-Bnpl', '[class*="ShopInfo-Bnpl"]', '.Organic-Bnpl', '[class*="Organic-Bnpl"]']);
  if (shopInfoBnplEl) {
    const bnplTypes: string[] = [];
    // В реальном HTML ярлыки могут быть не только в p/span/a, иногда это div
    const textNodes = Array.prototype.slice.call(shopInfoBnplEl.querySelectorAll('p, span, a, div')) as Element[];
    for (let i = 0; i < textNodes.length && bnplTypes.length < 5; i++) {
      const t = (textNodes[i].textContent || '').trim();
      if (!t) continue;
      const tl = t.toLowerCase();
      let normalized: string | null = null;
      // Нормализация под runtime-маппинг (mapBnplLabelToType)
      if (tl.indexOf('сплит') !== -1) normalized = 'Сплит';
      else if (tl.indexOf('плайт') !== -1) normalized = 'Плайт';
      else if (tl.indexOf('долями') !== -1) normalized = 'Долями';
      else if (tl.indexOf('плати частями') !== -1) normalized = 'Плати частями';
      else if (tl.indexOf('мокка') !== -1) normalized = 'Мокка';
      else if (tl.indexOf('подели') !== -1) normalized = 'Подели';
      else if (tl.indexOf('мтс') !== -1 && (tl.indexOf('пэй') !== -1 || tl.indexOf('pay') !== -1)) normalized = 'МТС Пэй';
      if (normalized && !bnplTypes.includes(normalized)) bnplTypes.push(normalized);
    }
    for (let i = 0; i < bnplTypes.length; i++) {
      row[`#ShopInfo-Bnpl-Item-${i + 1}`] = bnplTypes[i];
    }
    row['#ShopInfo-Bnpl-Count'] = String(bnplTypes.length);
    row['#ShopInfo-Bnpl'] = bnplTypes.length > 0 ? 'true' : 'false';
    Logger.debug(`✅ Найден ShopInfo-Bnpl с ${bnplTypes.length} опциями: ${bnplTypes.join(', ')}`);
  } else {
    row['#ShopInfo-Bnpl'] = 'false';
    row['#ShopInfo-Bnpl-Count'] = '0';
  }
  
  // #EPrice_view_special - специальный вид цены (зелёная)
  const priceSpecial = queryFirstMatch(cache, rules['EPrice_view_special']?.domSelectors || ['.EPrice_view_special', '[class*="EPrice_view_special"]']);
  if (priceSpecial) {
    row['#EPrice_View'] = 'special';
    Logger.debug(`✅ Найден EPrice_view_special в сниппете "${row['#OrganicTitle']?.substring(0, 30)}..."`);
  }
  
  // === EPriceGroup BEM-модификаторы ===
  // Извлекаем свойства из BEM-классов EPriceGroup (size, withDisclaimer, plusCashback и др.)
  const ePriceGroupEl = queryFirstMatch(cache, ['.EPriceGroup', '[class*="EPriceGroup"]']);
  if (ePriceGroupEl) {
    const pgCls = ePriceGroupEl.className || '';
    
    // #EPriceGroup_Size — size variant (m, l, L2)
    const sizeMatch = pgCls.match(/EPriceGroup_size_(\w+)/);
    if (sizeMatch) {
      row['#EPriceGroup_Size'] = sizeMatch[1]; // m, l, L2
      Logger.debug(`✅ EPriceGroup size=${sizeMatch[1]}`);
    }
    
    // #EPriceGroup_Barometer — withBarometer (boolean BEM modifier)
    if (pgCls.includes('EPriceGroup_withBarometer')) {
      row['#EPriceGroup_Barometer'] = 'true';
      Logger.debug(`✅ EPriceGroup withBarometer=true`);
    }
    
    // #PriceDisclaimer — withDisclaimer (boolean BEM modifier)
    if (pgCls.includes('EPriceGroup_withDisclaimer')) {
      row['#PriceDisclaimer'] = 'true';
      Logger.debug(`✅ EPriceGroup withDisclaimer=true`);
    }
    
    // #PlusCashback — plusCashback (boolean BEM modifier)
    if (pgCls.includes('EPriceGroup_plusCashback') || pgCls.includes('EPriceGroup_withPlusCashback')) {
      row['#PlusCashback'] = 'true';
      Logger.debug(`✅ EPriceGroup plusCashback=true`);
    }
    
    // #ExpCalculation — [EXP] Calculation (boolean BEM modifier)
    if (pgCls.includes('EPriceGroup_expCalculation') || pgCls.includes('EPriceGroup_EXPCalculation')) {
      row['#ExpCalculation'] = 'true';
      Logger.debug(`✅ EPriceGroup expCalculation=true`);
    }
    
    // #CombiningElements — Combining Elements variant
    const combMatch = pgCls.match(/EPriceGroup_combiningElements_(\w+)/);
    if (combMatch) {
      row['#CombiningElements'] = combMatch[1]; // None, Discount, etc.
      Logger.debug(`✅ EPriceGroup combiningElements=${combMatch[1]}`);
    }
  }
  
  // #LabelDiscount_View - вид лейбла скидки
  // 1. outlineSpecial — "Вам –X%" (зелёная рамка, спецпредложение Пэй)
  // 2. outlinePrimary — обычная скидка "–X%" (синяя рамка)
  const labelOutlineSpecial = queryFirstMatch(cache, rules['Label_view_outlineSpecial']?.domSelectors || ['.Label_view_outlineSpecial', '[class*="Label_view_outlineSpecial"]']);
  const labelOutlinePrimary = queryFirstMatch(cache, ['.Label_view_outlinePrimary', '[class*="Label_view_outlinePrimary"]']);
  
  if (labelOutlineSpecial) {
    row['#LabelDiscount_View'] = 'outlineSpecial';
    row['#DiscountPrefix'] = 'Вам';
    
    // Формируем полный текст "Вам –X%" для #discount, чтобы processTextLayers не перезаписал его
    const discountVal = row['#discount'] || row['#DiscountPercent'];
    if (discountVal) {
      // Форматируем: добавляем "Вам " перед значением скидки
      const cleanDiscount = discountVal.replace(/^[–-]?\s*/, ''); // Убираем минус в начале если есть
      row['#discount'] = `Вам –${cleanDiscount}`;
      Logger.debug(`✅ Найден Label_view_outlineSpecial, сформирован текст: "${row['#discount']}"`);
    } else {
      Logger.debug(`✅ Найден Label_view_outlineSpecial с префиксом "Вам" в сниппете "${row['#OrganicTitle']?.substring(0, 30)}..."`);
    }
  } else if (labelOutlinePrimary) {
    row['#LabelDiscount_View'] = 'outlinePrimary';
    Logger.debug(`✅ Найден Label_view_outlinePrimary (обычная скидка)`);
  }
  
  // #Fintech - блок рассрочки/оплаты (Сплит/Пэй/Ozon и др.)
  const fintechSelectors = ['.Fintech:not(.Fintech-Icon)', '[class*="EPriceGroup-Fintech"]'];
  const fintech = queryFirstMatch(cache, fintechSelectors);
  if (fintech) {
    row['#EPriceGroup_Fintech'] = 'true';
    
    // #InfoIcon — проверяем наличие иконки "Инфо" внутри Fintech/EPriceGroup
    // Иконка находится в <div class="InfoIcon"><span class="InfoIcon-Icon">...</span></div>
    const infoIconEl = fintech.querySelector('.InfoIcon .InfoIcon-Icon, .InfoIcon [class*="InfoIcon-Icon"]');
    if (infoIconEl) {
      row['#InfoIcon'] = 'true';
      Logger.debug(`✅ Найден InfoIcon в Fintech`);
    } else {
      row['#InfoIcon'] = 'false';
    }
    
    // Определяем type из классов Fintech_type_*
    // Порядок важен: сначала более специфичные (yandexPay), потом общие (pay)
    // Маппинг HTML классов → Figma variant values
    // Figma MetaFintech.type: split, yandexPay, ozon, pay, Dolyami, Mokka, Podeli, Plait, T-Pay, MTS Pay, Wildberries, alfaCard
    const fintechClasses = fintech.className || '';
    Logger.debug(`🔍 Fintech classes: "${fintechClasses}"`);
    if (fintechClasses.includes('Fintech_type_split')) {
      row['#Fintech_Type'] = 'split';
      Logger.debug(`✅ Найден Fintech type=split`);
    } else if (fintechClasses.includes('Fintech_type_yandexPay')) {
      row['#Fintech_Type'] = 'yandexPay';
      Logger.debug(`✅ Найден Fintech type=yandexPay`);
    } else if (fintechClasses.includes('Fintech_type_pay')) {
      row['#Fintech_Type'] = 'pay';
      Logger.debug(`✅ Найден Fintech type=pay`);
    } else if (fintechClasses.includes('Fintech_type_ozon')) {
      row['#Fintech_Type'] = 'ozon';
      Logger.debug(`✅ Найден Fintech type=ozon`);
    } else if (fintechClasses.includes('Fintech_type_dolyame')) {
      row['#Fintech_Type'] = 'Dolyami';
      Logger.debug(`✅ Найден Fintech type=Dolyami`);
    } else if (fintechClasses.includes('Fintech_type_plait')) {
      row['#Fintech_Type'] = 'Plait';
      Logger.debug(`✅ Найден Fintech type=Plait`);
    } else if (fintechClasses.includes('Fintech_type_podeli')) {
      row['#Fintech_Type'] = 'Podeli';
      Logger.debug(`✅ Найден Fintech type=Podeli`);
    } else if (fintechClasses.includes('Fintech_type_mokka')) {
      row['#Fintech_Type'] = 'Mokka';
      Logger.debug(`✅ Найден Fintech type=Mokka`);
    } else if (fintechClasses.includes('Fintech_type_mtsPay')) {
      row['#Fintech_Type'] = 'MTS Pay';
      Logger.debug(`✅ Найден Fintech type=MTS Pay`);
    } else if (fintechClasses.includes('Fintech_type_tPay')) {
      row['#Fintech_Type'] = 'T-Pay';
      Logger.debug(`✅ Найден Fintech type=T-Pay`);
    } else if (fintechClasses.includes('Fintech_type_alfa')) {
      row['#Fintech_Type'] = 'alfaCard';
      Logger.debug(`✅ Найден Fintech type=alfaCard`);
    } else if (fintechClasses.includes('Fintech_type_wildberries')) {
      row['#Fintech_Type'] = 'Wildberries';
      Logger.debug(`✅ Найден Fintech type=Wildberries`);
    }
    
    // Определяем view (значения в lowercase с дефисами как в Figma)
    // Figma Fintech.view: "default" | "extra-short" | "short" | "long" | "extra-long"
    if (fintechClasses.includes('Fintech_view_extra-short')) {
      row['#Fintech_View'] = 'extra-short';
      Logger.debug(`✅ Fintech view=extra-short`);
    } else if (fintechClasses.includes('Fintech_view_short')) {
      row['#Fintech_View'] = 'short';
      Logger.debug(`✅ Fintech view=short`);
    } else if (fintechClasses.includes('Fintech_view_long')) {
      row['#Fintech_View'] = 'long';
      Logger.debug(`✅ Fintech view=long`);
    } else if (fintechClasses.includes('Fintech_view_extra-long')) {
      row['#Fintech_View'] = 'extra-long';
      Logger.debug(`✅ Fintech view=extra-long`);
    } else {
      // По умолчанию если view не задан
      row['#Fintech_View'] = 'default';
    }
  } else {
    row['#EPriceGroup_Fintech'] = 'false';
    row['#InfoIcon'] = 'false';
  }
  
  // ВАЖНО: Устанавливаем view по умолчанию для цен БЕЗ Fintech
  // Если есть скидка, но нет Fintech:
  //   - LabelDiscount view = outlinePrimary (обычная скидка)
  //   - EPrice view = default (обычная цена)
  // Если есть Fintech:
  //   - LabelDiscount view = outlineSpecial (уже установлено выше)
  //   - EPrice view = special (уже установлено выше)
  const hasDiscount = row['#EPriceGroup_Discount'] === 'true' || row['#DiscountPercent'] || row['#discount'];
  const hasFintech = row['#EPriceGroup_Fintech'] === 'true';
  
  if (hasDiscount && !hasFintech) {
    // Устанавливаем view только если не установлен (не перезаписываем outlineSpecial/special)
    if (!row['#LabelDiscount_View']) {
      row['#LabelDiscount_View'] = 'outlinePrimary';
      Logger.debug(`✅ Установлен LabelDiscount_View=outlinePrimary (без Fintech)`);
    }
    if (!row['#EPrice_View']) {
      row['#EPrice_View'] = 'default';
      Logger.debug(`✅ Установлен EPrice_View=default (без Fintech)`);
    }
  } else if (!hasDiscount) {
    // ВАЖНО: Если НЕТ скидки — сбрасываем EPrice view на default
    // Это нужно чтобы не наследовать view от предыдущих данных
    row['#EPrice_View'] = 'default';
    Logger.debug(`✅ Установлен EPrice_View=default (нет скидки)`);
  }
  
  // #EBnpl - блок BNPL (Buy Now Pay Later) в EShopItem и ESnippet delivery row
  const ebnplSelectors = rules['EBnpl']?.domSelectors || [
    '.EShopItem-Bnpl', '[class*="EShopItem-Bnpl"]', '.EBnpl',
    '.DeliveriesBnpl', '[class*="DeliveriesBnpl"]', '.EDeliveryGroup-Bnpl', '[class*="-Bnpl"]'
  ];
  const ebnplContainer = queryFirstMatch(cache, ebnplSelectors);
  if (ebnplContainer) {
    // Выставим флаг позже: только если реально нашли >= 1 опцию BNPL
    
    // Извлекаем список BNPL опций (Сплит, Долями и т.д.)
    // Важно: в реальном HTML контейнер может быть .EShopItem-Bnpl без класса .EBnpl,
    // поэтому ищем items ВНУТРИ найденного контейнера (а не только ".EBnpl ...").
    // Берём Line-AddonContent в DOM-порядке, максимум 5.
    const ebnplItems = Array.prototype.slice.call(
      ebnplContainer.querySelectorAll('.Line-AddonContent, [class*="Line-AddonContent"]')
    ) as Element[];
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
    row['#EBnpl'] = bnplOptions.length > 0 ? 'true' : 'false';
    
    Logger.debug(`✅ Найден EBnpl с ${bnplOptions.length} опциями: ${bnplOptions.join(', ')}`);
  } else {
    row['#EBnpl'] = 'false';
    row['#EBnpl-Count'] = '0';
  }
  
  // #EPriceBarometer - проверяем наличие и определяем view — ОПТИМИЗИРОВАНО (Phase 5)
  // Поддерживаем оба формата классов: EPriceBarometer_type_X и EPriceBarometer-X
  const priceBarometer = queryFirstMatch(cache, rules['EPriceBarometer'].domSelectors);
  if (priceBarometer) {
    Logger.debug(`🔍 Найден EPriceBarometer в сниппете "${row['#OrganicTitle']?.substring(0, 30)}..."`);
    
    // Устанавливаем Barometer=true для ELabelGroup
    row['#ELabelGroup_Barometer'] = 'true';
    
    // Определяем view на основе дополнительных классов
    // Поддерживаем оба формата: below-market/in-market/above-market И EPriceBarometer-Cheap/Average/Expensive
    const barometerClassString = priceBarometer.className || '';
    let barometerView: string | null = null;
    
    if (barometerClassString.includes('below-market') || barometerClassString.includes('EPriceBarometer-Cheap')) {
      barometerView = 'below-market';
      Logger.debug(`✅ Определен view для EPriceBarometer: below-market`);
    } else if (barometerClassString.includes('in-market') || barometerClassString.includes('EPriceBarometer-Average')) {
      barometerView = 'in-market';
      Logger.debug(`✅ Определен view для EPriceBarometer: in-market`);
    } else if (barometerClassString.includes('above-market') || barometerClassString.includes('EPriceBarometer-Expensive')) {
      barometerView = 'above-market';
      Logger.debug(`✅ Определен view для EPriceBarometer: above-market`);
    }
    
    if (barometerView) {
      row['#EPriceBarometer_View'] = barometerView;
    } else {
      Logger.warn(`⚠️ Не удалось определить view для EPriceBarometer. Классы: ${barometerClassString}`);
    }
    
    // Определяем isCompact по типу сниппета
    // EShopItem — компактные карточки магазинов, используем isCompact=true
    // EOfferItem, Organic и другие — полноразмерные, isCompact=false
    const isCompact = snippetType === 'EShopItem';
    row['#EPriceBarometer_isCompact'] = isCompact ? 'true' : 'false';
    Logger.debug(`📐 [EPriceBarometer] isCompact=${isCompact} (тип сниппета: ${snippetType})`);
  } else {
    // Если EPriceBarometer не найден, устанавливаем Barometer=false для ELabelGroup
    row['#ELabelGroup_Barometer'] = 'false';
  }
  
  // #EQuote - цитата из отзыва (для ESnippet и Organic)
  // Парсим из EQuote / OrganicUgcReviews-QuoteWrapper
  // #EQuote-Text — текст цитаты ("«Отличный магазин...»")
  // #EQuote-AuthorAvatar — URL изображения аватара (предпочтительно retina из srcset)
  
  const equoteContainer = queryFirstMatch(cache, [
    '.EQuote',
    '.OrganicUgcReviews-QuoteWrapper',
    '[class*="EQuote"]',
    '[class*="OrganicUgcReviews-QuoteWrapper"]'
  ]);
  
  if (equoteContainer) {
    // Текст цитаты
    const quoteTextEl = equoteContainer.querySelector('.EQuote-Text, [class*="EQuote-Text"]');
    if (quoteTextEl) {
      const quoteText = quoteTextEl.textContent?.trim() || '';
      if (quoteText) {
        row['#EQuote-Text'] = quoteText;
        // Legacy поле для совместимости
        row['#QuoteText'] = quoteText;
        row['#withQuotes'] = 'true';
        Logger.debug(`✅ [EQuote-Text] Найдена цитата: "${quoteText.substring(0, 50)}..."`);
      }
    }
    
    // Аватар автора цитаты
    // Приоритет: srcset (retina), потом src
    const avatarImg = equoteContainer.querySelector(
      '.EQuote-AuthorAvatar, [class*="EQuote-AuthorAvatar"], .EQuote-AvatarWrapper img, [class*="EQuote-AvatarWrapper"] img'
    ) as HTMLImageElement | null;
    
    if (avatarImg) {
      let avatarUrl = '';
      
      // Пробуем srcset для retina (2x)
      const srcset = avatarImg.getAttribute('srcset');
      if (srcset) {
        // Формат: "url1 1x, url2 2x" — берём 2x (retina) если есть
        const srcsetParts = srcset.split(',').map(s => s.trim());
        for (const part of srcsetParts) {
          if (part.includes('2x')) {
            avatarUrl = part.replace(/\s+2x$/, '').trim();
            break;
          }
        }
        // Если нет 2x, берём первый
        if (!avatarUrl && srcsetParts.length > 0) {
          avatarUrl = srcsetParts[0].replace(/\s+\d+x$/, '').trim();
        }
      }
      
      // Fallback на src
      if (!avatarUrl) {
        avatarUrl = avatarImg.getAttribute('src') || avatarImg.getAttribute('data-src') || '';
      }
      
      if (avatarUrl) {
        row['#EQuote-AuthorAvatar'] = (avatarUrl.startsWith('http') || avatarUrl.startsWith('data:')) ? avatarUrl : `https:${avatarUrl}`;
        // Legacy поле для совместимости
        row['#QuoteImage'] = row['#EQuote-AuthorAvatar'];
        Logger.debug(`✅ [EQuote-AuthorAvatar] Аватар: "${row['#EQuote-AuthorAvatar'].substring(0, 80)}..."`);
      }
    }
  }
  // Если цитата не была найдена, явно устанавливаем withQuotes=false
  if (!row['#withQuotes']) {
    row['#withQuotes'] = 'false';
  }
  // ВАЖНО: Убран fallback на OrganicUgcReviews-Text, т.к. этот класс используется
  // для количества отзывов (#EReviews_shopText), а не для цитаты.
  // Цитата парсится ТОЛЬКО из EQuote / OrganicUgcReviews-QuoteWrapper.
  
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
      row[`#Sitelink_${i + 1}`] = sitelinks[i];
    }
    row['#SitelinksCount'] = String(sitelinks.length);
    
    if (sitelinks.length > 0) {
      Logger.debug(`✅ Найдены сайтлинки (${sitelinks.length}): ${sitelinks.join(', ')}`);
    }
  } else {
    row['#Sitelinks'] = 'false';
    row['#SitelinksCount'] = '0';
  }
  
  // #Phone - телефон (для ESnippet)
  const phoneSelectors = rules['Phone']?.domSelectors || ['.CoveredPhone', '[class*="CoveredPhone"]'];
  const phoneEl = queryFirstMatch(cache, phoneSelectors);
  if (phoneEl) {
    const phoneText = phoneEl.textContent?.trim() || '';
    if (phoneText) {
      row['#Phone'] = phoneText;
      Logger.debug(`✅ Найден телефон: "${phoneText}"`);
    }
  }
  
  // #PromoOffer - промо-предложение (для ESnippet)
  const promoSelectors = rules['PromoOffer']?.domSelectors || ['.PromoOffer', '[class*="PromoOffer"]'];
  const promoEl = queryFirstMatch(cache, promoSelectors);
  if (promoEl) {
    const promoText = promoEl.textContent?.trim() || '';
    if (promoText) {
      row['#Promo'] = promoText;
      Logger.debug(`✅ Найден промо-текст: "${promoText.substring(0, 50)}..."`);
    }
  }
  
  // #Address - адрес (для ESnippet)
  const addressSelectors = rules['Address']?.domSelectors || ['.Organic-Address', '[class*="Organic-Address"]'];
  const addressEl = queryFirstMatch(cache, addressSelectors);
  if (addressEl) {
    const addressText = addressEl.textContent?.trim() || '';
    if (addressText) {
      row['#Address'] = addressText;
      Logger.debug(`✅ Найден адрес: "${addressText}"`);
    }
  }
  
  // #addressText и #addressLink - ShopOfflineRegion (для EShopItem/ESnippet)
  // Пример 1: "Москва · м. Белорусская" + "Большая Грузинская улица, 69"
  // Пример 2: "Москва" + "77 филиалов"
  const shopOfflineRegion = queryFirstMatch(cache, ['.ShopOfflineRegion', '[class*="ShopOfflineRegion"]']);
  if (shopOfflineRegion) {
    row['#hasShopOfflineRegion'] = 'true';
    
    // Ищем ссылку внутри ShopOfflineRegion
    const linkEl = shopOfflineRegion.querySelector('.Link, [class*="Link_theme"]');
    const linkText = linkEl?.textContent?.trim() || '';
    
    if (linkText) {
      row['#addressLink'] = linkText;
      Logger.debug(`✅ [ShopOfflineRegion] addressLink: "${linkText}"`);
    }
    
    // Собираем текст до ссылки (город, метро и т.д.)
    // Берём весь текст контейнера и убираем текст ссылки
    const fullText = shopOfflineRegion.textContent?.trim() || '';
    let addressTextPart = fullText;
    
    if (linkText) {
      // Убираем текст ссылки из полного текста
      addressTextPart = fullText.replace(linkText, '').trim();
    }
    
    // Убираем лишние разделители в начале и конце
    addressTextPart = addressTextPart.replace(/^[·\s]+|[·\s]+$/g, '').trim();
    // Заменяем множественные разделители на один
    addressTextPart = addressTextPart.replace(/\s*·\s*/g, ' · ');
    // Заменяем тонкий пробел на обычный
    addressTextPart = addressTextPart.replace(/\u2009/g, ' ');
    
    if (addressTextPart) {
      row['#addressText'] = addressTextPart;
      Logger.debug(`✅ [ShopOfflineRegion] addressText: "${addressTextPart}"`);
    }
  } else {
    row['#hasShopOfflineRegion'] = 'false';
  }
  
  // #BUTTON и #ButtonView - логика кнопок для разных типов сниппетов
  // 
  // EOfferItem:
  //   - Красная кнопка чекаута (Button_view_primary, market_checkout) → ButtonView='primaryShort'
  //   - Белая кнопка "В магазин" (Button_view_white) → ButtonView='white'
  // 
  // EShopItem:
  //   - Красная кнопка чекаута (EMarketCheckoutButton) → ButtonView='primaryShort'
  //   - Дефолтная кнопка (Button_view_default) → ButtonView='secondary'
  // 
  // ESnippet/Organic:
  //   - Кнопка чекаута → ButtonView='primaryShort', EButton_visible='true'
  //   - Нет кнопки → EButton_visible='false'
  
  // Селекторы для красной кнопки чекаута (приоритет)
  const checkoutButtonSelectors = [
    '[data-market-url-type="market_checkout"]',
    '.MarketCheckout-Button',
    '[class*="MarketCheckout-Button"]',
    '[id^="MarketCheckoutButtonBase__"]',
    '.EMarketCheckoutButton-Container',
    '.EMarketCheckoutButton-Button',
    '.Button_view_primary[href*="/cart"]',
    '.Button_view_primary[href*="/express"]',
    'a[href*="market.yandex.ru/my/cart"]',
    'a[href*="checkout.kit.yandex.ru/express"]'
  ];
  
  // Селекторы для белой кнопки "В магазин" (EOfferItem)
  const whiteButtonSelectors = rules['Button_view_white']?.domSelectors || [
    '.Button_view_white',
    '[class*="Button_view_white"]',
    '.EOfferItem-Button.Button_view_white'
  ];
  
  // Селекторы для дефолтной кнопки (EShopItem)
  const defaultButtonSelectors = rules['Button_view_default']?.domSelectors || [
    '.Button_view_default',
    '[class*="Button_view_default"]',
    '.EShopItem-ButtonLink.Button_view_default'
  ];
  
  // Ищем кнопки в порядке приоритета
  const checkoutBtn = queryFirstMatch(cache, checkoutButtonSelectors);
  const whiteBtn = queryFirstMatch(cache, whiteButtonSelectors);
  const defaultBtn = queryFirstMatch(cache, defaultButtonSelectors);
  
  // Также проверяем модификатор EShopItem_withCheckout
  const hasCheckoutModifier = container.classList.contains('EShopItem_withCheckout') || 
                              container.className.includes('EShopItem_withCheckout');
  
  // Проверяем модификатор Organic-Checkout (для Organic сниппетов)
  const hasOrganicCheckout = container.classList.contains('Organic-Checkout') || 
                             container.className.includes('Organic-Checkout');
  
  // Fallback: ищем по тексту "Купить в 1 клик"
  const buttonTextEl = container.querySelector('.Button-Text');
  const hasCheckoutText = buttonTextEl && buttonTextEl.textContent?.includes('Купить в 1 клик');
  
  // Определяем наличие и тип кнопки
  // ВАЖНО: для Organic используем hasOrganicCheckout, для остальных — общую логику
  const hasCheckoutButton = checkoutBtn !== null || hasCheckoutModifier || hasCheckoutText;
  const hasWhiteButton = whiteBtn !== null;
  const hasDefaultButton = defaultBtn !== null;
  
  // Определяем #ButtonView и видимость в зависимости от типа сниппета
  // 
  // ЛОГИКА КНОПОК:
  // - EOfferItem: обрабатывается отдельно выше (строки 143-266) с ранним return
  // - EShopItem: кнопка ВСЕГДА видна (checkout → primaryLong, иначе → secondary)
  // - ESnippet/Organic: кнопка скрывается если нет красной (красная → primaryShort + visible, иначе → hidden)
  //
  if (snippetType === 'EShopItem') {
    // Touch: кнопка скрыта, показываем только для checkout
    // Desktop: кнопка ВСЕГДА видна
    if (isTouch) {
      row['#BUTTON'] = hasCheckoutButton ? 'true' : 'false';
      row['#ButtonView'] = hasCheckoutButton ? 'primaryShort' : '';
      row['#ButtonType'] = hasCheckoutButton ? 'checkout' : 'shop';
      row['#EButton_visible'] = hasCheckoutButton ? 'true' : 'false';
      Logger.debug(`✅ [EShopItem Touch] Checkout=${hasCheckoutButton} → BUTTON='${row['#BUTTON']}'`);
    } else {
      row['#BUTTON'] = 'true';  // Кнопка всегда есть
      if (hasCheckoutButton) {
        row['#ButtonView'] = 'primaryLong';
        row['#ButtonType'] = 'checkout';
        Logger.debug(`✅ [EShopItem] Checkout → ButtonView='primaryLong'`);
      } else {
        row['#ButtonView'] = 'secondary';
        row['#ButtonType'] = 'shop';
        Logger.debug(`✅ [EShopItem] Нет красной кнопки → ButtonView='secondary'`);
      }
    }
  } else if (snippetType === 'Organic_withOfferInfo' || snippetType === 'Organic') {
    // ESnippet/Organic: логика как у EProductSnippet2
    // Кнопка показывается ТОЛЬКО если есть Organic-Checkout или EMarketCheckoutLabel
    // ВАЖНО: используем hasOrganicCheckout (класс на контейнере), а не общий hasCheckoutButton
    const checkoutLabel = queryFirstMatch(cache, ['.EMarketCheckoutLabel', '.EThumb-LabelsCheckoutContainer']);
    const hasRealCheckout = hasOrganicCheckout || checkoutLabel !== null;
    
    if (hasRealCheckout) {
      row['#BUTTON'] = 'true';
      // Для Organic/ESnippet по новой логике используем удлинённую кнопку
      row['#ButtonView'] = 'primaryLong';
      row['#EButton_visible'] = 'true';
      row['#ButtonType'] = 'checkout';
      Logger.debug(`✅ [ESnippet] Organic-Checkout найден → ButtonView='primaryLong', visible='true'`);
    } else {
      row['#BUTTON'] = 'false';
      row['#EButton_visible'] = 'false';
      row['#ButtonType'] = 'shop';
      Logger.debug(`ℹ️ [ESnippet] Нет Organic-Checkout → кнопка скрыта`);
    }
  } else if (snippetType === 'EProductSnippet2') {
    // EProductSnippet2: проверяем EMarketCheckoutLabel или красную кнопку
    const checkoutLabel = queryFirstMatch(cache, ['.EMarketCheckoutLabel', '.EThumb-LabelsCheckoutContainer']);
    if (checkoutLabel || hasCheckoutButton) {
      row['#BUTTON'] = 'true';
      row['#ButtonView'] = 'primaryShort';
      row['#ButtonType'] = 'checkout';
      // При checkout показываем лейбл EMarketCheckoutLabel в Figma
      row['#EMarketCheckoutLabel'] = 'true';
      Logger.debug(`✅ [EProductSnippet2] Лейбл/кнопка чекаута → ButtonView='primaryShort'`);
    } else {
      row['#BUTTON'] = 'false';
      row['#ButtonType'] = 'shop';
      // При отсутствии checkout скрываем лейбл EMarketCheckoutLabel
      row['#EMarketCheckoutLabel'] = 'false';
    }
  } else {
    // Другие типы сниппетов — по умолчанию без кнопки
    row['#BUTTON'] = (hasCheckoutButton || hasWhiteButton || hasDefaultButton) ? 'true' : 'false';
  }
  
  // Логируем итог
  if (row['#BUTTON'] === 'true') {
    Logger.debug(`🛒 [BUTTON] ${snippetType}: BUTTON=true, ButtonView='${row['#ButtonView'] || 'не задан'}' для "${row['#OrganicTitle']?.substring(0, 30)}..."`);
  }
  
  // === ФИЛЬТР ДЛЯ ORGANIC: пропускаем если нет цены ===
  // Organic сниппеты без EPrice не являются товарными карточками
  // ИСКЛЮЧЕНИЕ: EThumbGroup (каталожные страницы) — у них нет цены и это нормально
  const isCatalogPage = row['#isCatalogPage'] === 'true' || row['#imageType'] === 'EThumbGroup';
  if ((snippetType === 'Organic' || snippetType === 'Organic_withOfferInfo') && 
      (!row['#OrganicPrice'] || row['#OrganicPrice'].trim() === '') &&
      !isCatalogPage) {
    Logger.debug(`⚠️ Пропущен ${snippetType} без цены: "${row['#OrganicTitle']?.substring(0, 40)}..."`);
    return { row: null, spriteState: spriteState };
  }
  
  // === FALLBACK-ЦЕПОЧКИ ДЛЯ ПОЛЕЙ ===
  // OrganicText ← OrganicTitle (обязательно для ESnippet)
  if (!row['#OrganicText'] || row['#OrganicText'].trim() === '') {
    row['#OrganicText'] = row['#OrganicTitle'] || '';
  }
  
  // OrganicHost ← Извлечение из FaviconImage (приоритет)
  // URL вида: https://favicon.yandex.net/favicon/v2/www.vseinstrumenti.ru?size=32
  if (!row['#OrganicHost'] || row['#OrganicHost'].trim() === '') {
    const favUrl = row['#FaviconImage'] || '';
    if (favUrl) {
      // Паттерн для Yandex favicon API: /favicon/v2/HOSTNAME
      const faviconMatch = favUrl.match(/\/favicon\/v2\/([^?/]+)/);
      if (faviconMatch && faviconMatch[1]) {
        const extractedHost = decodeURIComponent(faviconMatch[1]).replace(/^www\./, '');
        row['#OrganicHost'] = extractedHost;
        Logger.debug(`✅ [OrganicHost] Извлечён из FaviconImage: ${extractedHost}`);
      }
    }
  }
  
  // OrganicHost ← ShopName (fallback если ещё не установлен)
  if (!row['#OrganicHost'] || row['#OrganicHost'].trim() === '') {
    row['#OrganicHost'] = row['#ShopName'] || '';
  }
  
  // ShopName ← OrganicHost (обратный fallback)
  if (!row['#ShopName'] || row['#ShopName'].trim() === '') {
    row['#ShopName'] = row['#OrganicHost'] || '';
  }
  
  // === ЭВРИСТИКА: Favicon из Host ===
  if ((!row['#FaviconImage'] || row['#FaviconImage'].trim() === '') && 
      row['#OrganicHost'] && row['#OrganicHost'].trim() !== '') {
    // Генерируем URL фавикона из хоста
    const host = row['#OrganicHost'].replace(/^www\./, '');
    row['#FaviconImage'] = `https://${host}/favicon.ico`;
    Logger.debug(`🔧 [FALLBACK] FaviconImage сгенерирован из Host: ${row['#FaviconImage']}`);
  }
  
  // Валидация: требуем заголовок и хотя бы один источник
  const hasSource = (row['#OrganicHost'] && row['#OrganicHost'].trim() !== '') || (row['#ShopName'] && row['#ShopName'].trim() !== '');
  if (!row['#OrganicTitle'] || !hasSource) {
    return { row: null, spriteState: spriteState };
  }
  
  return { row: row, spriteState: spriteState };
}

// Дедуплицирует строки по уникальному ключу
// ВАЖНО: EShopItem и EOfferItem — это карточки РАЗНЫХ магазинов для ОДНОГО товара,
// поэтому для них ключ должен включать ShopName, а не только ProductURL
export function deduplicateRows(rows: CSVRow[]): CSVRow[] {
  const uniqueRows = new Map<string, CSVRow>();
  
  for (const row of rows) {
    const snippetType = row['#SnippetType'] || '';
    const isMultiShopType = snippetType === 'EShopItem' || snippetType === 'EOfferItem';
    
    let uniqueKey: string;
    
    if (isMultiShopType) {
      // Для EShopItem/EOfferItem: URL + ShopName (разные магазины = разные карточки)
      const url = (row['#ProductURL'] || '').trim();
      const shop = (row['#ShopName'] || row['#OrganicHost'] || '').trim();
      uniqueKey = `${url}|${shop}`;
      Logger.debug(`🔑 [dedup] EShopItem/EOfferItem: key="${shop}" (URL: ${url.substring(0, 50)}...)`);
    } else {
      // Для других типов: стандартная логика (URL или Title+Shop)
      uniqueKey = row['#ProductURL'] || '';
    if (!uniqueKey || uniqueKey.trim() === '') {
      const title = (row['#OrganicTitle'] || '').trim();
      const shop = (row['#ShopName'] || row['#OrganicHost'] || '').trim();
      uniqueKey = `${title}|${shop}`;
      }
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
  
  // Статистика дедупликации по типам
  const typeStats: Record<string, number> = {};
  for (const row of uniqueRows.values()) {
    const t = row['#SnippetType'] || 'Unknown';
    typeStats[t] = (typeStats[t] || 0) + 1;
  }
  Logger.debug(`📊 [dedup] Результат: ${Object.entries(typeStats).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  
  return Array.from(uniqueRows.values());
}

// Parse Yandex search results from HTML
// ============================================================================
// WIZARD PARSING — FuturisSearch (Alice's Answer)
// ============================================================================

function normalizeWizardText(value: string): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function normalizeWizardSpanText(value: string): string {
  return (value || '').replace(/\u00a0/g, ' ');
}

/**
 * Извлекает спаны (text + bold) из элемента, пропуская FuturisFootnote.
 * Логика аналогична mishamisha/llm-answers-exporter/src/utils/dom.js → extractSpans
 */
function extractWizardSpans(containerEl: Element): WizardSpan[] {
  const spans: WizardSpan[] = [];

  function pushSpan(text: string, bold: boolean): void {
    const normalized = normalizeWizardSpanText(text);
    if (!normalized) return;
    const last = spans.length > 0 ? spans[spans.length - 1] : null;
    if (last && last.bold === bold) {
      last.text += normalized;
      return;
    }
    spans.push({ text: normalized, bold });
  }

  function walk(node: Node, inheritedBold: boolean): void {
    if (node.nodeType === Node.TEXT_NODE) {
      pushSpan(node.nodeValue || '', inheritedBold);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    if (el.classList.contains('FuturisFootnote')) return;

    const isBold = inheritedBold || el.tagName === 'STRONG' || el.tagName === 'B';
    const children = el.childNodes;
    for (let i = 0; i < children.length; i++) {
      walk(children[i], isBold);
    }
  }

  walk(containerEl, false);
  return spans;
}

/**
 * Извлекает footnotes (источники) из элемента.
 * Логика аналогична mishamisha/llm-answers-exporter/src/utils/dom.js → extractFootnotes
 */
function extractWizardFootnotes(containerEl: Element): WizardFootnote[] {
  const footnoteLinks = containerEl.querySelectorAll('a.Link.FuturisFootnote.FuturisFootnote_redesign');
  const result: WizardFootnote[] = [];
  for (let i = 0; i < footnoteLinks.length; i++) {
    const link = footnoteLinks[i] as HTMLAnchorElement;
    const iconEl = link.querySelector('.FuturisFootnote-Icon');
    let iconUrl = '';
    if (iconEl) {
      const style = iconEl.getAttribute('style') || '';
      const match = style.match(/background-image:\s*url\(["']?(.*?)["']?\)/i);
      if (match) {
        iconUrl = match[1];
      }
    }
    result.push({
      text: normalizeWizardText(link.textContent || ''),
      href: link.getAttribute('href') || '',
      iconUrl,
      debug: iconUrl ? null : { styleAttr: (iconEl && iconEl.getAttribute('style')) || '' }
    });
  }
  return result;
}

/**
 * Определяет тип компонента и извлекает данные из одного DOM-элемента.
 * Логика аналогична mishamisha/llm-answers-exporter/src/parsers/ya-ru.js → buildComponentFromElement
 */
function buildWizardComponent(el: Element): WizardComponent | null {
  // Заголовки: определяем уровень из tagName (h1–h6), fallback h2
  if (el.classList.contains('FuturisContentSection-Title') || /^H[1-6]$/i.test(el.tagName || '')) {
    const level = /^H[1-6]$/i.test(el.tagName || '') ? el.tagName.toLowerCase() as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' : 'h2';
    return { type: level, text: normalizeWizardText(el.textContent || '') };
  }

  if (el.classList.contains('FuturisMarkdown-Paragraph')) {
    return {
      type: 'p',
      spans: extractWizardSpans(el),
      footnotes: extractWizardFootnotes(el)
    };
  }

  if (el.classList.contains('FuturisMarkdown-UnorderedList')) {
    const items: WizardListItem[] = [];
    const lis = el.querySelectorAll(':scope > li.FuturisMarkdown-ListItem');
    for (let i = 0; i < lis.length; i++) {
      items.push({
        spans: extractWizardSpans(lis[i]),
        footnotes: extractWizardFootnotes(lis[i])
      });
    }
    return { type: 'ul', items };
  }

  if (el.classList.contains('FuturisMarkdown-OrderedList')) {
    const items: WizardListItem[] = [];
    const lis = el.querySelectorAll(':scope > li.FuturisMarkdown-ListItem');
    for (let i = 0; i < lis.length; i++) {
      items.push({
        spans: extractWizardSpans(lis[i]),
        footnotes: extractWizardFootnotes(lis[i])
      });
    }
    return { type: 'ol', items };
  }

  if (el.classList.contains('FuturisImage-Image')) {
    return {
      type: 'img',
      src: el.getAttribute('src') || '',
      alt: normalizeWizardText(el.getAttribute('alt') || '')
    };
  }

  if (el.classList.contains('VideoSnippet') || el.classList.contains('VideoSnippet2')) {
    const videoEl = el.querySelector('video.VideoThumb3-Video');
    let poster = '';
    if (videoEl) {
      poster = videoEl.getAttribute('poster') || '';
      if (!poster) {
        const vStyle = videoEl.getAttribute('style') || '';
        const vMatch = vStyle.match(/background-image:\s*url\(["']?(.*?)["']?\)/i);
        if (vMatch) poster = vMatch[1];
      }
      if (poster && poster.startsWith('//')) poster = 'https:' + poster;
    }
    const titleEl = el.querySelector('.VideoSnippet-Title');
    const hostEl = el.querySelector('.VideoHostExtended-Host');
    const durationEl = el.querySelector('.VideoSnippet-Duration .Label-Content');
    return {
      type: 'video',
      poster,
      title: titleEl ? normalizeWizardText(titleEl.textContent || '') : '',
      host: hostEl ? normalizeWizardText(hostEl.textContent || '') : '',
      channelTitle: '',
      views: '',
      date: '',
      duration: durationEl ? normalizeWizardText(durationEl.textContent || '') : ''
    };
  }

  return null;
}

/**
 * Рекурсивно обходит DOM-дерево и собирает все компоненты wizard.
 */
function collectWizardComponents(rootEl: Element): WizardComponent[] {
  const components: WizardComponent[] = [];

  function walk(node: Element): void {
    const children = node.children;
    if (!children) return;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const component = buildWizardComponent(child);
      if (component) {
        components.push(component);
        continue;
      }
      walk(child);
    }
  }

  walk(rootEl);
  return components;
}

/**
 * Извлекает все wizard-блоки (FuturisSearch) из документа.
 */
function extractFuturisSearchWizards(doc: Document): WizardPayload[] {
  const wizards: WizardPayload[] = [];
  const wrappers = doc.querySelectorAll('.FuturisGPTMessage-GroupContentComponentWrapper');
  Logger.debug(`[Wizard] FuturisGPTMessage-GroupContentComponentWrapper найдено: ${wrappers.length}`);

  for (let i = 0; i < wrappers.length; i++) {
    const components = collectWizardComponents(wrappers[i]);
    if (components.length > 0) {
      wizards.push({ type: 'FuturisSearch', components });
      Logger.debug(`[Wizard] FuturisSearch #${i + 1}: ${components.length} компонентов`);
    }
  }

  return wizards;
}

export function parseYandexSearchResults(html: string, fullMhtml?: string, parsingRules?: ParsingSchema): { rows: CSVRow[], wizards?: WizardPayload[], error?: string } {
  Logger.debug('🔍 HTML разбор начат');
  try {
  Logger.debug('📄 Размер HTML:', html.length);
  if (fullMhtml) {
    Logger.debug('📄 Размер полного содержимого файла:', fullMhtml.length);
  }
  
  // ДИАГНОСТИКА: Проверяем наличие <style> тегов в сыром HTML до парсинга
  const rawStyleMatches = html.match(STYLE_TAG_REGEX);
  const rawStyleCount = rawStyleMatches ? rawStyleMatches.length : 0;
  Logger.debug(`🔍 [DIAGNOSTIC] Найдено <style> тегов в сыром HTML: ${rawStyleCount}`);
  if (rawStyleCount > 0 && rawStyleMatches) {
    Logger.debug(`   - Примеры найденных <style> тегов (первые 200 символов каждого):`);
    rawStyleMatches.slice(0, 3).forEach((match, idx) => {
      const preview = match.substring(0, 200).replace(/\n/g, ' ').replace(/\s+/g, ' ');
      Logger.debug(`     ${idx + 1}. ${preview}...`);
    });
  }
  
  // ДИАГНОСТИКА: Проверяем наличие <link> тегов со стилями
  const linkMatches = html.match(LINK_STYLESHEET_REGEX);
  const linkCount = linkMatches ? linkMatches.length : 0;
  Logger.debug(`🔍 [DIAGNOSTIC] Найдено <link rel="stylesheet"> тегов: ${linkCount}`);
  
  // Создаем DOM парсер для разбора HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Определяем платформу (desktop/touch)
  const platform = detectPlatformFromHtmlContent(html);
  Logger.info(`📱 [PARSE] Платформа: ${platform}`);
  
  // === Global field: #query (search request) ===
  // Важно: input часто находится ВНЕ контейнера сниппета, поэтому извлекаем 1 раз на документ.
  let globalQuery = '';
  try {
    const queryEl = doc.querySelector('.HeaderForm-Input') as HTMLInputElement | null;
    if (queryEl) {
      globalQuery = (queryEl.value || queryEl.getAttribute('value') || '').trim();
    }
  } catch (e) {
    // ignore
  }
  if (globalQuery) {
    Logger.debug(`🔎 [PARSE] Найден #query: "${globalQuery.substring(0, 120)}"`);
  } else {
    Logger.debug('🔎 [PARSE] #query не найден (HeaderForm-Input)');
  }
  
  // PHASE 4 OPTIMIZATION: Строим CSS кэш ОДИН РАЗ при инициализации
  const cssCache = buildCSSCache(doc, fullMhtml || html);
  Logger.debug(`✅ [CSS CACHE] Построен: ${cssCache.stats.totalRules} правил, ${cssCache.stats.faviconRules} favicon, ${cssCache.stats.spriteRules} спрайтов`);
  
  // Находим и фильтруем контейнеры сниппетов
  const allContainers = findSnippetContainers(doc);
  const containers = filterTopLevelContainers(allContainers);
  Logger.debug(`📦 Найдено контейнеров-сниппетов (после дедупликации и удаления вложенных): ${containers.length}`);
  
  // ДИАГНОСТИКА: подробная статистика по типам контейнеров
  const containerTypeCounts: Record<string, number> = {};
  for (const c of containers) {
    const className = c.className || '';
    let cType = 'Unknown';
    if (className.includes('EShopItem')) cType = 'EShopItem';
    else if (className.includes('EOfferItem')) cType = 'EOfferItem';
    else if (className.includes('EProductSnippet2')) cType = 'EProductSnippet2';
    else if (className.includes('Organic_withOfferInfo')) cType = 'Organic_withOfferInfo';
    else if (className.includes('ProductTile-Item')) cType = 'ProductTile-Item';
    containerTypeCounts[cType] = (containerTypeCounts[cType] || 0) + 1;
  }
  const typeStats = Object.entries(containerTypeCounts).map(([k, v]) => `${k}=${v}`).join(', ');
  Logger.info(`📦 [PARSE] Контейнеры по типам: ${typeStats}`);
  
  // Если не нашли стандартные контейнеры, пытаемся найти любые элементы с данными о товарах
  if (containers.length === 0) {
    Logger.debug('⚠️ Стандартные контейнеры не найдены, ищем альтернативные элементы...');
    const altContainers = [
      ...Array.from(doc.querySelectorAll('[class*="Snippet"]')),
      ...Array.from(doc.querySelectorAll('[class*="Product"]')),
      ...Array.from(doc.querySelectorAll('[class*="Item"]'))
    ];
    Logger.debug(`🔍 Альтернативных элементов найдено: ${altContainers.length}`);
    if (altContainers.length > 0) {
      Logger.debug('📋 Примеры классов:', Array.from(altContainers).slice(0, 10).map(el => el.className));
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
    
    // Передаем CSS кэш, полный контент, DOM кэш контейнера и платформу
    const result = extractRowData(container, doc, spriteState, cssCache, fullMhtml || html, containerCache, parsingRules, platform);
    spriteState = result.spriteState; // Обновляем состояние спрайта
    if (result.row) {
      // Прокидываем global #query и #platform во все строки
      if (globalQuery) result.row['#query'] = globalQuery;
      result.row['#platform'] = platform;
      results.push(result.row);
    }
  }
  const domCacheTime = performance.now() - domCacheStartTime;
  Logger.debug(`✅ [DOM CACHE] Обработано ${containers.length} контейнеров за ${domCacheTime.toFixed(2)}ms`);
  
  // ДИАГНОСТИКА ДО дедупликации: подробная статистика EShopItem
  const eShopItemBefore = results.filter(r => r['#SnippetType'] === 'EShopItem');
  const eOfferItemBefore = results.filter(r => r['#SnippetType'] === 'EOfferItem');
  if (eShopItemBefore.length > 0 || eOfferItemBefore.length > 0) {
    Logger.info(`🔍 [PARSE] ДО дедупликации: EShopItem=${eShopItemBefore.length}, EOfferItem=${eOfferItemBefore.length}`);
    if (eShopItemBefore.length > 0) {
      Logger.debug(`   🛒 EShopItem магазины: ${eShopItemBefore.map(r => r['#ShopName'] || 'N/A').join(', ')}`);
    }
  }
  
  // Дедуплицируем результаты
  const finalResults = deduplicateRows(results);
  Logger.debug(`📊 Дедупликация: ${results.length} → ${finalResults.length} уникальных строк`);
  
  // ДИАГНОСТИКА ПОСЛЕ дедупликации: статистика EShopItem
  const eShopItemAfter = finalResults.filter(r => r['#SnippetType'] === 'EShopItem');
  const eOfferItemAfter = finalResults.filter(r => r['#SnippetType'] === 'EOfferItem');
  if (eShopItemAfter.length > 0 || eOfferItemAfter.length > 0) {
    Logger.info(`✅ [PARSE] ПОСЛЕ дедупликации: EShopItem=${eShopItemAfter.length}, EOfferItem=${eOfferItemAfter.length}`);
    if (eShopItemAfter.length > 0) {
      Logger.debug(`   🛒 EShopItem магазины: ${eShopItemAfter.map(r => r['#ShopName'] || 'N/A').join(', ')}`);
    }
    if (eShopItemAfter.length < eShopItemBefore.length) {
      Logger.warn(`   ⚠️ Потеряно EShopItem при дедупликации: ${eShopItemBefore.length - eShopItemAfter.length}`);
    }
  }
  
  // ДИАГНОСТИКА: статистика по типам сниппетов
  const catalogCount = finalResults.filter(r => r['#isCatalogPage'] === 'true').length;
  const thumbGroupCount = finalResults.filter(r => r['#imageType'] === 'EThumbGroup').length;
  const thumbCount = finalResults.filter(r => r['#imageType'] === 'EThumb').length;
  Logger.debug(`📊 [PARSE] Статистика imageType:`);
  Logger.debug(`   📄 EThumbGroup (каталог): ${thumbGroupCount}`);
  Logger.debug(`   🖼️ EThumb (товар): ${thumbCount}`);
  Logger.debug(`   📂 #isCatalogPage=true: ${catalogCount}`);
  
  // Извлекаем wizard-блоки (FuturisSearch)
  const wizards = extractFuturisSearchWizards(doc);
  if (wizards.length > 0) {
    Logger.info(`🧙 [PARSE] Извлечено wizard-блоков: ${wizards.length}, всего компонентов: ${wizards.reduce((sum, w) => sum + w.components.length, 0)}`);
  }

  return { rows: finalResults, wizards: wizards.length > 0 ? wizards : undefined };
  } catch (e) {
    Logger.error('Error in parseYandexSearchResults:', e);
    return { rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}

