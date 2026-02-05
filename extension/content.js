/**
 * Content Script: Yandex Search Results Parser
 * Извлекает данные из сниппетов поисковой выдачи Яндекса
 * Основано на логике src/utils/snippet-parser.ts
 */

(function() {
  'use strict';

  // ============================================================================
  // CONSTANTS & REGEX
  // ============================================================================
  
  const PRICE_DIGITS_REGEX = /[^0-9]/g;
  const CURRENCY_RUB_REGEX = /₽|руб/i;
  const CURRENCY_USD_REGEX = /\$/i;
  const CURRENCY_EUR_REGEX = /€/;
  const DISCOUNT_VALUE_REGEX = /[\u2212\u002D\u2013\u2014]\s*([\d\s\u2009\u00A0,]+)\s*%?|([\d\s\u2009\u00A0,]+)\s*%/;
  const RATING_REGEX = /([\d,]+)/;
  const REVIEWS_REGEX = /([\d\s,]+)\s*К?\s*(?:отзыв|review)/i;
  const RATING_INVALID_START_REGEX = /^[\u2212\u002D\u2013\u2014]/;

  // Контейнеры сниппетов (CSS селекторы)
  // Desktop: <li class="serp-item">
  // Touch: <div class="serp-item serp-list__card">
  const CONTAINER_SELECTORS = [
    'li.serp-item',
    'div.serp-item.serp-list__card'
  ].join(', ');

  // Селекторы для рекламных сниппетов (пропускаем)
  const ADV_SELECTORS = [
    '.Organic-Label_type_advertisement',
    '.Organic-Subtitle_type_advertisement',
    '.AdvLabel',
    '.OrganicAdvLabel',
    '.AdvProductGallery',
    '.AdvProductGalleryCard'
  ];

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Получает текстовое содержимое элемента
   */
  function getTextContent(el) {
    if (!el) return '';
    return (el.textContent || '').trim().replace(/\s+/g, ' ');
  }

  /**
   * Форматирует цену с математическим пробелом (U+2009)
   */
  function formatPriceWithThinSpace(priceStr) {
    if (!priceStr || priceStr.length < 4) return priceStr;
    return priceStr.replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
  }

  /**
   * Проверяет, находится ли элемент внутри рекламной галереи
   */
  function isInsideAdvProductGallery(container) {
    let parent = container.parentElement;
    while (parent) {
      const cls = parent.className || '';
      if (cls.includes('AdvProductGallery') || cls.includes('AdvProductGalleryCard')) {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }

  /**
   * Определяет платформу страницы (desktop или touch)
   * Touch-версия имеет другую структуру HTML и классы
   */
  function detectPlatform() {
    // Проверяем HeaderPhone — надёжный маркер touch версии
    if (document.querySelector('.HeaderPhone')) {
      console.log('[Platform] Detected: touch (HeaderPhone)');
      return 'touch';
    }
    
    // Проверяем классы body на платформу
    const bodyClass = document.body?.className || '';
    if (bodyClass.includes('i-ua_platform_ios') || 
        bodyClass.includes('i-ua_platform_android')) {
      console.log('[Platform] Detected: touch (i-ua_platform_*)');
      return 'touch';
    }
    
    // Проверяем наличие touch-phone модификаторов в сниппетах
    if (document.querySelector('[class*="@touch-phone"]')) {
      console.log('[Platform] Detected: touch (@touch-phone modifier)');
      return 'touch';
    }
    
    // Проверяем HeaderDesktop — маркер desktop версии
    if (document.querySelector('.HeaderDesktop')) {
      console.log('[Platform] Detected: desktop (HeaderDesktop)');
      return 'desktop';
    }
    
    // По умолчанию — desktop
    console.log('[Platform] Detected: desktop (default)');
    return 'desktop';
  }

  /**
   * Проверяет, является ли сниппет рекламным, который следует ПРОПУСТИТЬ
   * 
   * ВАЖНО: Теперь парсим ВСЕ рекламные сниппеты:
   * - Organic_withAdvLabel (промо-сниппеты)
   * - AdvProductGallery (рекламные галереи товаров)
   * - AdvProductGalleryCard (карточки в рекламных галереях)
   * 
   * Они помечаются флагом #isAdv=true
   */
  function isAdvertisement(container) {
    // Больше ничего не пропускаем — парсим все рекламные сниппеты
    // Они будут помечены флагом #isAdv=true
    return false;
  }

  /**
   * Определяет тип сниппета
   */
  function getSnippetType(container) {
    const className = container.className || '';
    
    // EOfferItem — оффер с ценой
    if (className.includes('EOfferItem')) return 'EOfferItem';
    
    // AdvProductGallery — рекламная галерея товаров (обрабатывается отдельно)
    if (className.includes('AdvProductGallery') && !className.includes('AdvProductGalleryCard')) {
      return 'AdvProductGallery';
    }
    
    // AdvProductGalleryCard — карточка внутри галереи (парсится как EProductSnippet2)
    if (className.includes('AdvProductGalleryCard')) return 'EProductSnippet2_Adv';
    
    // EProductSnippet2 — карточка товара
    if (className.includes('EProductSnippet2')) return 'EProductSnippet2';
    
    // EShopItem — магазин
    if (className.includes('EShopItem')) return 'EShopItem';
    
    // ProductTile — плитка товара
    if (className.includes('ProductTile-Item')) return 'ProductTile-Item';
    
    // ESnippet — товарный сниппет (с ценой, офферами, кнопками)
    // Проверяем по наличию характерных элементов внутри
    if (className.includes('ESnippet') || 
        container.querySelector('.ESnippet, .ESnippet-Title, .ESnippet-Price')) {
      return 'ESnippet';
    }
    
    // Промо-сниппеты (рекламные органические сниппеты) — тип ESnippet
    // Проверяем класс ИЛИ наличие AdvLabel внутри
    if (className.includes('Organic_withAdvLabel') || className.includes('Organic_withPromoOffer')) {
      return 'Organic_Adv';
    }
    
    // Также проверяем наличие AdvLabel внутри Organic сниппета
    // (некоторые промо-сниппеты имеют просто класс "Organic organic" но с AdvLabel внутри)
    if (className.includes('Organic') && container.querySelector('.AdvLabel, .OrganicAdvLabel')) {
      console.log('[getSnippetType] Обнаружен промо-сниппет по наличию .AdvLabel внутри');
      return 'Organic_Adv';
    }
    
    // Organic_withOfferInfo — органика с офферами
    if (className.includes('Organic_withOfferInfo')) return 'Organic_withOfferInfo';
    
    // Organic — обычный органический сниппет (fallback → ESnippet в Figma)
    return 'Organic';
  }

  /**
   * Извлекает URL продукта
   */
  function extractProductURL(container) {
    // Сначала пробуем найти data-href (используется в EProductSnippet2)
    const dataHrefSelectors = [
      '.EProductSnippet2-Overlay[data-href]',
      '[data-href]'
    ];
    
    for (const selector of dataHrefSelectors) {
      const el = container.querySelector(selector);
      if (el) {
        const href = el.getAttribute('data-href');
        if (href) {
          return href.startsWith('http') ? href : `https:${href}`;
        }
      }
    }
    
    // Затем пробуем обычные href
    const hrefSelectors = [
      '.EProductSnippet2 a[href]',
      '.EShopItem-ButtonLink[href]',
      '.EShopItem-Title a[href]',
      '.EShopItem a[href]',
      '.EOfferItem-Button[href]',
      '.EOfferItem-ShopName a[href]',
      '.EOfferItem a[href]',
      '.OrganicTitle a[href]',
      '.Organic-Title a[href]',
      '.ProductTile-Item a[href]',
      'a[href]'
    ];

    for (const selector of hrefSelectors) {
      const link = container.querySelector(selector);
      if (link) {
        const href = link.getAttribute('href');
        if (href) {
          return href.startsWith('http') ? href : `https:${href}`;
        }
      }
    }
    return '';
  }

  /**
   * Извлекает изображение с учётом srcset и data-src
   */
  function extractImage(container, selectors) {
    for (const selector of selectors) {
      const img = container.querySelector(selector);
      if (img) {
        // Приоритет: data-src > srcset (первый URL) > src
        let src = img.getAttribute('data-src') || 
                  img.getAttribute('src') || 
                  img.getAttribute('srcset');
        
        if (src && src.includes(' ')) {
          // srcset: берём первый URL
          src = src.split(',')[0].trim().split(' ')[0];
        }
        
        if (src && !src.startsWith('data:')) {
          return src.startsWith('http') ? src : `https:${src}`;
        }
      }
    }
    return '';
  }

  /**
   * Извлекает цены
   */
  function extractPrices(container) {
    const result = { price: '', currency: '', oldPrice: '' };
    
    // Ищем текущую цену (не в .EPrice_view_old)
    const priceSelectors = [
      '.EPrice_size_l:not(.EPrice_view_old) .EPrice-Value',
      '.EPriceGroup-Price:not(.EPrice_view_old) .EPrice-Value',
      '.EPrice-Value'
    ];
    
    for (const selector of priceSelectors) {
      const priceEl = container.querySelector(selector);
      if (priceEl) {
        // Проверяем что это не старая цена
        let parent = priceEl.parentElement;
        let isOld = false;
        let depth = 0;
        while (parent && depth < 5) {
          if ((parent.className || '').includes('view_old')) {
            isOld = true;
            break;
          }
          parent = parent.parentElement;
          depth++;
        }
        
        if (!isOld) {
          const priceText = priceEl.textContent || '';
          const digits = priceText.replace(PRICE_DIGITS_REGEX, '');
          if (digits.length >= 1) {
            result.price = formatPriceWithThinSpace(digits);
            
            // Определяем валюту
            if (CURRENCY_RUB_REGEX.test(priceText)) result.currency = '₽';
            else if (CURRENCY_USD_REGEX.test(priceText)) result.currency = '$';
            else if (CURRENCY_EUR_REGEX.test(priceText)) result.currency = '€';
            else result.currency = '₽'; // default
            
            break;
          }
        }
      }
    }
    
    // Ищем старую цену
    // Селекторы для старой цены: EPrice_view_old или EPriceGroup-PriceOld
    const oldPriceSelectors = [
      '.EPrice_view_old .EPrice-Value',
      '[class*="EPrice_view_old"] .EPrice-Value',
      '.EPriceGroup-PriceOld .EPrice-Value',
      '[class*="EPriceGroup-PriceOld"] .EPrice-Value'
    ];
    
    for (const selector of oldPriceSelectors) {
      const oldPriceEl = container.querySelector(selector);
      if (oldPriceEl) {
        const oldPriceText = oldPriceEl.textContent || '';
        const digits = oldPriceText.replace(PRICE_DIGITS_REGEX, '');
        if (digits.length >= 1) {
          result.oldPrice = formatPriceWithThinSpace(digits);
          console.log(`[Price] OldPrice найдена: "${result.oldPrice}" (селектор: ${selector})`);
          break;
        }
      }
    }
    
    if (!result.oldPrice) {
      // Fallback: ищем EPriceGroup-Pair и извлекаем второй EPrice
      const pairEl = container.querySelector('.EPriceGroup-Pair');
      if (pairEl) {
        const allPrices = pairEl.querySelectorAll('.EPrice-Value');
        if (allPrices.length >= 1) {
          // Последний EPrice-Value в Pair обычно старая цена
          const lastPriceEl = allPrices[allPrices.length - 1];
          const oldPriceText = lastPriceEl.textContent || '';
          const digits = oldPriceText.replace(PRICE_DIGITS_REGEX, '');
          if (digits.length >= 1) {
            result.oldPrice = formatPriceWithThinSpace(digits);
            console.log(`[Price] OldPrice из EPriceGroup-Pair (fallback): "${result.oldPrice}"`);
          }
        }
      }
    }
    
    return result;
  }

  /**
   * Извлекает скидку
   */
  function extractDiscount(container) {
    const discountSelectors = [
      '.EPriceGroup-LabelDiscount .Label-Content',
      '.LabelDiscount .Label-Content',
      '.LabelDiscount'
    ];
    
    for (const selector of discountSelectors) {
      const discountEl = container.querySelector(selector);
      if (discountEl) {
        const text = discountEl.textContent?.trim() || '';
        const match = text.match(DISCOUNT_VALUE_REGEX);
        if (match) {
          const rawValue = (match[1] || match[2] || '').trim();
          const discountValue = rawValue.replace(/[^\d\s\u2009\u00A0]/g, '').trim();
          if (discountValue) {
            return {
              formatted: `–${discountValue.replace(/[\u2009\u00A0]/g, ' ')}%`,
              percent: discountValue.replace(/\s/g, '')
            };
          }
        }
      }
    }
    return null;
  }

  /**
   * Извлекает favicon с использованием getComputedStyle для живых страниц
   */
  function extractFavicon(container) {
    // Селекторы для поиска Favicon элемента
    const faviconSelectors = [
      '.Favicon[class*="Favicon-Page"]',  // Спрайт с классом страницы
      '.Favicon-Icon',
      '.Path .Favicon',
      '.EShopName .Favicon',
      '.Favicon'
    ];
    
    for (const selector of faviconSelectors) {
      const el = container.querySelector(selector);
      if (!el) continue;
      
      // ПРИОРИТЕТ 1: inline style (для MHTML совместимости)
      const inlineStyle = el.getAttribute('style') || '';
      const inlineBgMatch = inlineStyle.match(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/i);
      if (inlineBgMatch && inlineBgMatch[1]) {
        return processFaviconUrl(inlineBgMatch[1], el, inlineStyle);
      }
      
      // ПРИОРИТЕТ 2: getComputedStyle (для живых страниц!)
      try {
        const computed = window.getComputedStyle(el);
        const bgImage = computed.backgroundImage;
        
        if (bgImage && bgImage !== 'none') {
          const urlMatch = bgImage.match(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/i);
          if (urlMatch && urlMatch[1]) {
            const bgPosition = computed.backgroundPosition || '';
            return processSpriteUrl(urlMatch[1], bgPosition, el);
          }
        }
      } catch (e) {
        console.warn('[Favicon] getComputedStyle error:', e);
      }
      
      // ПРИОРИТЕТ 3: img внутри элемента
      const img = el.querySelector('img');
      if (img) {
        const src = img.getAttribute('src') || img.getAttribute('data-src');
        if (src && !src.startsWith('data:')) {
          return src.startsWith('http') ? src : `https:${src}`;
        }
      }
    }
    
    return '';
  }
  
  /**
   * Обрабатывает URL фавиконки (нормализация)
   */
  function processFaviconUrl(url, el, styleAttr) {
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = cleanUrl.startsWith('//') ? `https:${cleanUrl}` : `https://${cleanUrl}`;
    }
    
    // Если это спрайт с несколькими доменами — обрабатываем
    if (cleanUrl.includes('favicon.yandex.net/favicon/v2/') && cleanUrl.includes(';')) {
      const bgPosition = (styleAttr.match(/background-position[^:]*:\s*([^;]+)/i) || [])[1] || '';
      return processSpriteUrl(cleanUrl, bgPosition, el);
    }
    
    return cleanUrl;
  }
  
  /**
   * Обрабатывает спрайт-URL с несколькими доменами
   * Извлекает конкретный домен по background-position или классу
   */
  function processSpriteUrl(bgUrl, bgPosition, el) {
    let cleanUrl = bgUrl.trim();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = cleanUrl.startsWith('//') ? `https:${cleanUrl}` : `https://${cleanUrl}`;
    }
    
    // Если URL не содержит список доменов (;) — возвращаем как есть
    if (!cleanUrl.includes('favicon.yandex.net/favicon/v2/') || !cleanUrl.includes(';')) {
      return cleanUrl;
    }
    
    // Извлекаем список доменов
    const v2Match = cleanUrl.match(/favicon\.yandex\.net\/favicon\/v2\/([^?]+)/);
    if (!v2Match || !v2Match[1]) return cleanUrl;
    
    const domains = v2Match[1].split(';').filter(d => d.trim());
    if (domains.length === 0) return cleanUrl;
    
    // Определяем индекс по классу или background-position
    let index = 0;
    const className = el.className || '';
    
    // ПРИОРИТЕТ 1: класс Favicon-PageX_pos_Y
    const posClassMatch = className.match(/Favicon-Page\d+_pos_(\d+)/);
    if (posClassMatch) {
      index = parseInt(posClassMatch[1], 10);
      console.log(`[Favicon] Index from _pos_ class: ${index}`);
    }
    // ПРИОРИТЕТ 2: класс Favicon-EntryN
    else {
      const entryMatch = className.match(/Favicon-Entry(\d+)/i);
      if (entryMatch) {
        index = parseInt(entryMatch[1], 10) - 1; // Entry1 = index 0
        if (index < 0) index = 0;
        console.log(`[Favicon] Index from Entry class: ${index}`);
      }
    }
    // ПРИОРИТЕТ 3: background-position
    if (index === 0 && bgPosition) {
      const posValues = bgPosition.match(/-?\d+(?:\.\d+)?px/g);
      if (posValues && posValues.length > 0) {
        // Y-offset (второе значение или единственное)
        const yOffset = Math.abs(parseFloat(posValues[posValues.length > 1 ? 1 : 0]));
        if (yOffset > 0) {
          // Эвристика: определяем stride по кратности
          let stride = 20; // default
          if (yOffset % 20 === 0) stride = 20;
          else if (yOffset % 16 === 0) stride = 16;
          else if (yOffset % 24 === 0) stride = 24;
          else if (yOffset % 32 === 0) stride = 32;
          
          index = Math.round(yOffset / stride);
          console.log(`[Favicon] Index from position: ${yOffset}px / ${stride}px = ${index}`);
        }
      }
    }
    
    // Проверяем границы
    if (index < 0 || index >= domains.length) {
      console.warn(`[Favicon] Index ${index} out of bounds (0-${domains.length - 1}), using 0`);
      index = 0;
    }
    
    // Извлекаем домен по индексу и очищаем от протокола/путей
    let domain = domains[index].trim();
    // Убираем протокол если есть (https://domain.ru или http://domain.ru)
    if (domain.includes('://')) {
      try {
        const url = new URL(domain.startsWith('//') ? `https:${domain}` : domain);
        domain = url.hostname;
      } catch (e) {
        // Если URL не парсится, пробуем извлечь вручную
        domain = domain.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
      }
    } else {
      // Просто убираем путь и query
      domain = domain.split('/')[0].split('?')[0];
    }
    // Убираем www. если есть
    domain = domain.replace(/^www\./, '');
    
    if (!domain || domain.length < 3) {
      console.warn(`[Favicon] Invalid domain at index ${index}: "${domains[index]}"`);
      return '';
    }
    
    // НЕ используем encodeURIComponent для домена — favicon API принимает домен как есть
    const faviconUrl = `https://favicon.yandex.net/favicon/v2/${domain}?size=32&stub=1`;
    console.log(`[Favicon] Extracted domain "${domain}" at index ${index}: ${faviconUrl}`);
    
    return faviconUrl;
  }

  /**
   * Валидирует рейтинг (0-5)
   */
  function validateRating(text) {
    if (!text || text.trim() === '') return null;
    const trimmed = text.trim();
    
    if (trimmed.includes('%') || RATING_INVALID_START_REGEX.test(trimmed)) {
      return null;
    }
    
    const cleaned = trimmed.replace(/[^\d.,]/g, '');
    const normalized = cleaned.replace(',', '.');
    const ratingValue = parseFloat(normalized);
    
    if (isNaN(ratingValue) || ratingValue < 0 || ratingValue > 5) {
      return null;
    }
    
    return ratingValue.toFixed(1);
  }

  // ============================================================================
  // MAIN EXTRACTION FUNCTIONS
  // ============================================================================

  /**
   * Извлекает данные из EOfferItem (карточка предложения в попапе)
   */
  function extractEOfferItem(container) {
    // Получаем ID родительского serp-item
    const serpItemId = getSerpItemId(container);
    
    const row = {
      '#SnippetType': 'EOfferItem',
      '#serpItemId': serpItemId || ''
    };

    // Название магазина
    const shopEl = container.querySelector('.EOfferItem-ShopName, [class*="EOfferItem-ShopName"]');
    if (shopEl) {
      row['#ShopName'] = getTextContent(shopEl);
      row['#OrganicHost'] = row['#ShopName'];
    }
    
    // Цена
    const priceEl = container.querySelector('.EOfferItem .EPrice-Value, [class*="EOfferItem"] .EPrice-Value');
    if (priceEl) {
      const priceText = priceEl.textContent?.trim() || '';
      const digits = priceText.replace(PRICE_DIGITS_REGEX, '');
      if (digits.length >= 1) {
        row['#OrganicPrice'] = formatPriceWithThinSpace(digits);
        row['#Currency'] = '₽';
      }
    }
    
    // Отзывы
    const reviewsEl = container.querySelector('.EOfferItem-Reviews, [class*="EOfferItem-Reviews"]');
    if (reviewsEl) {
      const reviewsText = getTextContent(reviewsEl);
      row['#ReviewsNumber'] = reviewsText;
      const ratingMatch = reviewsText.match(RATING_REGEX);
      if (ratingMatch) {
        row['#ShopRating'] = ratingMatch[1];
      }
    }
    
    // Доставка
    const deliveryEl = container.querySelector('.EOfferItem-Deliveries, [class*="EOfferItem-Deliveries"]');
    if (deliveryEl) {
      row['#DeliveryList'] = getTextContent(deliveryEl);
    }
    
    // Кнопка
    const buttonEl = container.querySelector('.EOfferItem-Button, [class*="EOfferItem-Button"]');
    if (buttonEl) {
      row['#BUTTON'] = 'true';
      const btnClasses = buttonEl.className || '';
      const href = buttonEl.getAttribute('href') || '';
      
      const isCheckout = btnClasses.includes('Button_view_primary') || 
                         href.includes('/cart') || href.includes('/express');
      
      row['#ButtonView'] = isCheckout ? 'primaryShort' : 'white';
      row['#ButtonType'] = isCheckout ? 'checkout' : 'shop';
    } else {
      row['#BUTTON'] = 'true';
      row['#ButtonView'] = 'white';
      row['#ButtonType'] = 'shop';
    }
    
    // EPriceBarometer
    const barometerEl = container.querySelector('.EPriceBarometer, [class*="EPriceBarometer"]');
    if (barometerEl) {
      row['#ELabelGroup_Barometer'] = 'true';
      const cls = barometerEl.className || '';
      // Поддерживаем оба формата классов: EPriceBarometer_type_X и EPriceBarometer-X
      if (cls.includes('below-market') || cls.includes('EPriceBarometer-Cheap')) {
        row['#EPriceBarometer_View'] = 'below-market';
      } else if (cls.includes('in-market') || cls.includes('EPriceBarometer-Average')) {
        row['#EPriceBarometer_View'] = 'in-market';
      } else if (cls.includes('above-market') || cls.includes('EPriceBarometer-Expensive')) {
        row['#EPriceBarometer_View'] = 'above-market';
      }
      // isCompact: для EOfferItem всегда false (полноразмерный барометр)
      row['#EPriceBarometer_isCompact'] = 'false';
      console.log(`[Barometer] Найден в EOfferItem: view=${row['#EPriceBarometer_View']}, isCompact=false`);
    }
    
    // Модификаторы
    const containerCls = container.className || '';
    if (containerCls.includes('EOfferItem_defaultOffer')) row['#EOfferItem_defaultOffer'] = 'true';
    if (containerCls.includes('EOfferItem_button')) row['#EOfferItem_hasButton'] = 'true';
    if (containerCls.includes('EOfferItem_reviews')) row['#EOfferItem_hasReviews'] = 'true';
    if (containerCls.includes('EOfferItem_delivery')) row['#EOfferItem_hasDelivery'] = 'true';
    
    // Валидация
    if (!row['#ShopName']) return null;
    row['#OrganicTitle'] = row['#ShopName'];
    
    return row;
  }

  /**
   * Извлекает данные из стандартного сниппета
   */
  /**
   * Извлекает данные из стандартного сниппета
   * @param {Element} container - контейнер сниппета
   * @param {string} snippetType - тип сниппета
   * @param {string} platform - платформа ('desktop' или 'touch')
   */
  function extractStandardSnippet(container, snippetType, platform) {
    platform = platform || 'desktop';
    const isTouch = platform === 'touch';
    
    // Получаем ID родительского serp-item
    const serpItemId = getSerpItemId(container);

    const row = {
      '#SnippetType': snippetType,
      '#serpItemId': serpItemId || '',
      '#platform': platform
    };

    // #withThumb — наличие картинки в сниппете
    // Определяется по классу Organic_withThumb или наличию изображения
    const className = container.className || '';
    const hasThumbClass = className.includes('Organic_withThumb') || 
                          className.includes('_withThumb') ||
                          className.includes('withOfferThumb');
    const hasThumbImage = container.querySelector(
      '.Organic-OfferThumb img, .Organic-Thumb img, .EThumb img, [class*="Thumb"] img'
    );
    row['#withThumb'] = (hasThumbClass || hasThumbImage) ? 'true' : 'false';

    // #ProductURL
    const productURL = extractProductURL(container);
    if (productURL) {
      row['#ProductURL'] = productURL;
      try {
        const u = new URL(productURL);
        const isMarket = snippetType.includes('EProductSnippet') || 
                         snippetType.includes('EShopItem') ||
                         u.hostname.includes('market.yandex') ||
                         u.hostname.includes('ya.ru');
        if (!isMarket) {
          row['#OrganicHost'] = u.hostname.replace(/^www\./, '');
        }
      } catch (e) {}
    }
    
    // #OrganicTitle — точные селекторы первыми!
    const titleSelectors = [
      // Точные селекторы для текста заголовка (приоритет!)
      '.OrganicTitleContentSpan',
      'h2.OrganicTitle-LinkText',
      '.OrganicTitle-LinkText span',
      // EProductSnippet2
      '.EProductSnippet2-Title',
      '.EProductSnippet2-Title a',
      // EShopItem
      '.EShopItem-Title',
      '[class*="EShopItem-Title"]',
      // Fallback (менее точные)
      '.OrganicTitle',
      '.Organic-Title'
    ];
    for (const selector of titleSelectors) {
      const titleEl = container.querySelector(selector);
      if (titleEl) {
        row['#OrganicTitle'] = getTextContent(titleEl);
        break;
      }
    }
    
    // #ShopName
    if (snippetType === 'EProductSnippet2' || snippetType === 'EShopItem') {
      const shopSelectors = snippetType === 'EShopItem'
        ? ['.EShopItem-ShopName .Line-AddonContent', '.EShopItem-ShopName .EShopName', '.EShopItem-ShopName']
        : ['.EShopName .Line-AddonContent', '.EShopName'];
      
      for (const selector of shopSelectors) {
        const shopEl = container.querySelector(selector);
        if (shopEl) {
          row['#ShopName'] = getTextContent(shopEl);
          break;
        }
      }
    } else {
      // Organic — из .Path
      const pathEl = container.querySelector('.Path, [class*="Path"]');
      if (pathEl) {
        const pathText = getTextContent(pathEl);
        const separator = pathText.indexOf('›');
        const shopName = separator > 0 ? pathText.substring(0, separator).trim() : pathText.trim();
        row['#ShopName'] = shopName;
        if (!row['#OrganicHost']) {
          row['#OrganicHost'] = shopName;
        }
      }
    }
    
    // Fallback для ShopName
    if (!row['#ShopName']) {
      const shopAlt = container.querySelector('.EShopName, [class*="ShopName"]');
      if (shopAlt) {
        row['#ShopName'] = getTextContent(shopAlt);
      } else if (row['#OrganicHost']) {
        row['#ShopName'] = row['#OrganicHost'];
      }
    }
    
    // #OfficialShop
    const officialShop = container.querySelector('.EShopName .OfficialShop, [class*="official-vendor"]');
    row['#OfficialShop'] = officialShop ? 'true' : 'false';
    
    // #isVerified — badge "Сайт специализируется на продаже товаров"
    // ВАЖНО: Verified_type_goods — это НЕ "Официальный магазин"!
    const verifiedEl = container.querySelector('.Verified_type_goods, .Verified');
    if (verifiedEl) {
      row['#VerifiedType'] = 'goods';
      row['#isVerified'] = 'true';
    } else {
      row['#isVerified'] = 'false';
    }

    // #OrganicPath
    const pathEl = container.querySelector('.Path, [class*="Path"]');
    if (pathEl) {
      const pathText = getTextContent(pathEl);
      const separator = pathText.indexOf('›');
      row['#OrganicPath'] = separator > 0 ? pathText.substring(separator + 1).trim() : pathText;
    }
    
    // #FaviconImage
    row['#FaviconImage'] = extractFavicon(container);
    
    // FALLBACK: Если фавиконка не извлечена, генерируем из ShopName (для известных магазинов)
    if (!row['#FaviconImage'] && row['#ShopName']) {
      const shopName = row['#ShopName'].toLowerCase().trim();
      // Маппинг известных магазинов на домены
      const knownShops = {
        'wildberries': 'www.wildberries.ru',
        'ozon': 'www.ozon.ru',
        'яндекс маркет': 'market.yandex.ru',
        'yandex market': 'market.yandex.ru',
        'мвидео': 'www.mvideo.ru',
        'm.video': 'www.mvideo.ru',
        'dns': 'www.dns-shop.ru',
        'ситилинк': 'www.citilink.ru',
        'citilink': 'www.citilink.ru',
        'эльдорадо': 'www.eldorado.ru',
        'eldorado': 'www.eldorado.ru',
        'lamoda': 'www.lamoda.ru',
        'ламода': 'www.lamoda.ru',
        'aliexpress': 'aliexpress.ru',
        'алиэкспресс': 'aliexpress.ru',
        'сбермегамаркет': 'megamarket.ru',
        'мегамаркет': 'megamarket.ru'
      };
      
      const matchedDomain = knownShops[shopName];
      if (matchedDomain) {
        row['#FaviconImage'] = `https://favicon.yandex.net/favicon/v2/${matchedDomain}?size=32&stub=1`;
        console.log(`[Favicon] Fallback from ShopName "${row['#ShopName']}" → ${matchedDomain}`);
      }
    }
    
    // #OrganicText
    const textSelectors = ['.OrganicTextContentSpan', '.EProductSnippet2-Text', '.EShopItem-Description'];
    for (const selector of textSelectors) {
      const textEl = container.querySelector(selector);
      if (textEl) {
        row['#OrganicText'] = getTextContent(textEl);
        break;
      }
    }
    if (!row['#OrganicText'] && row['#OrganicTitle']) {
      row['#OrganicText'] = row['#OrganicTitle'];
    }
    
    // #EThumbGroup — коллаж из нескольких картинок
    // Определяем по классу Organic_withThumbCollage или наличию EThumbGroup
    const hasThumbCollage = className.includes('Organic_withThumbCollage') || 
                            className.includes('withThumbCollage');
    const thumbGroup = container.querySelector('.EThumbGroup');
    
    if (hasThumbCollage || thumbGroup) {
      // Извлекаем все картинки из EThumbGroup
      const thumbGroupEl = thumbGroup || container.querySelector('[class*="EThumbGroup"]');
      if (thumbGroupEl) {
        const thumbItems = thumbGroupEl.querySelectorAll('.EThumbGroup-Item .EThumb-Image, .EThumb-Image');
        const images = [];
        
        thumbItems.forEach((img, i) => {
          if (i >= 3) return; // Максимум 3 картинки
          const src = img.getAttribute('src') || img.getAttribute('data-src');
          if (src) {
            const fullUrl = src.startsWith('http') ? src : `https:${src}`;
            images.push(fullUrl);
          }
        });
        
        if (images.length >= 2) {
          // Есть коллаж — устанавливаем EThumbGroup
          row['#imageType'] = 'EThumbGroup';
          row['#ThumbGroupCount'] = String(images.length);
          images.forEach((url, i) => {
            row[`#Image${i + 1}`] = url;
          });
          row['#OrganicImage'] = images[0]; // Основная картинка
          row['#ThumbImage'] = images[0];
          console.log(`[EThumbGroup] Найден коллаж: ${images.length} картинок`);
        } else if (images.length === 1) {
          // Только одна картинка — обычный EThumb
          row['#imageType'] = 'EThumb';
          row['#OrganicImage'] = images[0];
          row['#ThumbImage'] = images[0];
        }
      }
    }
    
    // #OrganicImage — fallback если EThumbGroup не найден
    if (!row['#OrganicImage']) {
      // Touch-версия использует .EShopItem-Leading вместо .EShopItem-Left/.EShopItem-Image
      const imageSelectors = isTouch
        ? [
            '.EShopItem-Leading img', '.EShopItem-Image img',  // Touch-first
            '.Organic-OfferThumb img', '.Organic-OfferThumbImage',
            '.EProductSnippet2-Thumb img',
            'img.EThumb-Image', '.EThumb-Image'
          ]
        : [
            '.Organic-OfferThumb img', '.Organic-OfferThumbImage',
            '.EProductSnippet2-Thumb img', '.EShopItem-Image img',
            '.EShopItem-Left img',  // Desktop-specific
            'img.EThumb-Image', '.EThumb-Image'
          ];
      row['#OrganicImage'] = extractImage(container, imageSelectors);
      row['#ThumbImage'] = row['#OrganicImage'];
      row['#imageType'] = row['#OrganicImage'] ? 'EThumb' : '';
    }
    
    // Цены
    const prices = extractPrices(container);
    row['#OrganicPrice'] = prices.price;
    row['#Currency'] = prices.currency;
    if (prices.oldPrice) {
      row['#OldPrice'] = prices.oldPrice;
      row['#EPriceGroup_OldPrice'] = 'true';
    }
    
    // Скидка
    const discount = extractDiscount(container);
    if (discount) {
      row['#discount'] = discount.formatted;
      row['#DiscountPercent'] = discount.percent;
      row['#EPriceGroup_Discount'] = 'true';
      
      // #LabelDiscount_View — определяем вид лейбла скидки
      // outlineSpecial — зелёная "Вам –X%" (EPrice_view_special + Label_view_outlineSpecial)
      // outlinePrimary — синяя обычная "–X%"
      const labelDiscountEl = container.querySelector('.LabelDiscount, [class*="LabelDiscount"]');
      if (labelDiscountEl) {
        const labelCls = labelDiscountEl.className || '';
        if (labelCls.includes('Label_view_outlineSpecial') || labelCls.includes('outlineSpecial')) {
          row['#LabelDiscount_View'] = 'outlineSpecial';
          row['#DiscountPrefix'] = 'Вам';
          // Формируем "Вам –X%"
          row['#discount'] = `Вам ${discount.formatted}`;
          console.log(`[LabelDiscount] View=outlineSpecial (зелёная), discount="${row['#discount']}"`);
        } else {
          row['#LabelDiscount_View'] = 'outlinePrimary';
          console.log(`[LabelDiscount] View=outlinePrimary (синяя), discount="${row['#discount']}"`);
        }
      }
    }
    
    // #ShopRating
    const ratingEl = container.querySelector('.RatingOneStar .Line-AddonContent, [aria-label*="рейтинг" i]');
    if (ratingEl) {
      const ratingText = ratingEl.textContent?.trim() || '';
      const match = ratingText.match(RATING_REGEX);
      if (match) row['#ShopRating'] = match[1];
    }
    
    // #ShopInfo-Ugc
    const shopRatingSelectors = [
      '.OrganicUgcReviews-RatingContainer .RatingOneStar .Line-AddonContent',
      '.EReviewsLabel-Rating .Line-AddonContent',
      '.EShopItemMeta-UgcLine .RatingOneStar .Line-AddonContent',
      '.ShopInfo-Ugc .RatingOneStar .Line-AddonContent',
      '.RatingOneStar .Line-AddonContent'
    ];
    for (const selector of shopRatingSelectors) {
      const el = container.querySelector(selector);
      if (el) {
        const ugcText = getTextContent(el);
        const ugcMatch = ugcText.match(/([0-5](?:[.,]\d)?)/);
        if (ugcMatch) {
          row['#ShopInfo-Ugc'] = ugcMatch[1].replace(',', '.');
          break;
        }
      }
    }
    
    // #ReviewsNumber
    const reviewsEl = container.querySelector('.EShopItemMeta-Reviews, .EReviews, [aria-label*="отзыв" i]');
    if (reviewsEl) {
      const revText = reviewsEl.textContent?.trim() || '';
      const match = revText.match(REVIEWS_REGEX);
      if (match) row['#ReviewsNumber'] = match[1].trim();
    }
    
    // #EReviews_shopText
    const shopReviewsSelectors = [
      '.OrganicUgcReviews-Text',
      '.EReviewsLabel-Text',
      '.EShopItemMeta-Reviews .Line-AddonContent'
    ];
    for (const selector of shopReviewsSelectors) {
      const el = container.querySelector(selector);
      if (el) {
        const text = getTextContent(el);
        if (text && text.toLowerCase().includes('отзыв')) {
          row['#EReviews_shopText'] = text.includes('магазин') ? text : `${text} на магазин`;
          break;
        }
      }
    }
    
    // #QuoteText — цитата из отзыва (EQuote)
    const quoteSelectors = [
      '.EQuote-Text',
      '.OrganicUgcReviews-QuoteWrapper .EQuote-Text',
      '.EQuote'
    ];
    for (const selector of quoteSelectors) {
      const quoteEl = container.querySelector(selector);
      if (quoteEl) {
        const quoteText = getTextContent(quoteEl);
        if (quoteText) {
          row['#QuoteText'] = quoteText;
          row['#EQuote-Text'] = quoteText;
          row['#withQuotes'] = 'true';
          console.log(`[ESnippet] Цитата: "${quoteText.substring(0, 50)}..."`);
          break;
        }
      }
    }
    if (!row['#QuoteText']) {
      row['#withQuotes'] = 'false';
    }
    
    // #EQuote-AuthorAvatar — аватар автора цитаты
    const avatarSelectors = [
      '.EQuote-AuthorAvatar',
      '.EQuote-AvatarWrapper img',
      '[class*="EQuote-AuthorAvatar"]',
      '.OrganicUgcReviews-QuoteWrapper .EQuote-AvatarWrapper img'
    ];
    for (const selector of avatarSelectors) {
      const avatarEl = container.querySelector(selector);
      if (avatarEl) {
        // Предпочитаем srcset (retina) над src
        let avatarUrl = '';
        const srcset = avatarEl.getAttribute('srcset');
        if (srcset) {
          // Парсим srcset, берём URL с наибольшим множителем (2x)
          const parts = srcset.split(',').map(s => s.trim());
          for (const part of parts) {
            const [url, scale] = part.split(/\s+/);
            if (scale === '2x' && url) {
              avatarUrl = url;
              break;
            }
          }
          // Если не нашли 2x, берём первый URL
          if (!avatarUrl && parts.length > 0) {
            avatarUrl = parts[0].split(/\s+/)[0];
          }
        }
        // Fallback на src
        if (!avatarUrl) {
          avatarUrl = avatarEl.getAttribute('src') || '';
        }
        if (avatarUrl) {
          // Нормализуем URL
          if (avatarUrl.startsWith('//')) {
            avatarUrl = 'https:' + avatarUrl;
          }
          row['#EQuote-AuthorAvatar'] = avatarUrl;
          console.log(`[ESnippet] Аватар цитаты: "${avatarUrl.substring(0, 60)}..."`);
          break;
        }
      }
    }
    
    // #ProductRating (из ELabelRating, но НЕ LabelDiscount)
    const labelRating = container.querySelector('.ELabelRating:not(.LabelDiscount)');
    if (labelRating) {
      const labelContent = labelRating.querySelector('.Label-Content');
      const ratingText = labelContent ? getTextContent(labelContent) : getTextContent(labelRating);
      const validRating = validateRating(ratingText);
      if (validRating) {
        row['#ProductRating'] = validRating;
      }
    }
    
    // #EMarketCheckoutLabel
    const checkoutLabel = container.querySelector('.EMarketCheckoutLabel, [class*="EMarketCheckoutLabel"]');
    row['#EMarketCheckoutLabel'] = checkoutLabel ? 'true' : 'false';
    
    // #EDeliveryGroup — доставки (Курьер, В ПВЗ и др.)
    // Ищем в EDeliveryGroup, ShopInfo-Deliveries (Organic) или EShopItem-Deliveries (Touch)
    const deliveryGroup = container.querySelector(
      '.EDeliveryGroup:not(.EDeliveryGroup-Item), .ShopInfo-Deliveries, .EShopItem-Deliveries, .EShopItem-DeliveriesBnpl'
    );
    if (deliveryGroup) {
      const items = deliveryGroup.querySelectorAll('.EDeliveryGroup-Item');
      const deliveryItems = [];
      items.forEach((item, i) => {
        if (i >= 3) return;
        const text = item.textContent?.trim();
        if (text && !deliveryItems.includes(text)) {
          deliveryItems.push(text);
        }
      });
      
      deliveryItems.forEach((text, i) => {
        row[`#EDeliveryGroup-Item-${i + 1}`] = text;
      });
      row['#EDeliveryGroup-Count'] = String(deliveryItems.length);
      row['#EDeliveryGroup'] = deliveryItems.length > 0 ? 'true' : 'false';
    } else {
      row['#EDeliveryGroup'] = 'false';
      row['#EDeliveryGroup-Count'] = '0';
    }
    
    // #ShopOfflineRegion — адрес магазина (Москва · м. Павелецкая · адрес)
    const shopOfflineRegion = container.querySelector('.ShopOfflineRegion');
    if (shopOfflineRegion) {
      row['#hasShopOfflineRegion'] = 'true';
      
      // Ищем ссылку с адресом внутри
      const addressLinkEl = shopOfflineRegion.querySelector('.Link[role="button"], .Link_theme_normal');
      let addressLinkText = '';
      if (addressLinkEl) {
        addressLinkText = getTextContent(addressLinkEl);
        if (addressLinkText) {
          row['#addressLink'] = addressLinkText;
        }
      }
      
      // Извлекаем текст региона БЕЗ ссылки
      // Клонируем элемент, удаляем ссылку, получаем текст
      const clonedRegion = shopOfflineRegion.cloneNode(true);
      const linkInClone = clonedRegion.querySelector('.Link[role="button"], .Link_theme_normal');
      if (linkInClone) {
        linkInClone.remove();
      }
      const regionTextWithoutLink = getTextContent(clonedRegion);
      if (regionTextWithoutLink) {
        // Убираем trailing separator (·) если есть
        row['#addressText'] = regionTextWithoutLink.replace(/[·\s]+$/, '').trim();
        console.log(`[ShopOfflineRegion] text="${row['#addressText']}", link="${addressLinkText}"`);
      }
    } else {
      row['#hasShopOfflineRegion'] = 'false';
    }
    
    // #Fintech
    const fintech = container.querySelector('.Fintech:not(.Fintech-Icon), [class*="EPriceGroup-Fintech"]');
    if (fintech) {
      row['#EPriceGroup_Fintech'] = 'true';
      const cls = fintech.className || '';
      
      // Type
      if (cls.includes('Fintech_type_split')) row['#Fintech_Type'] = 'split';
      else if (cls.includes('Fintech_type_yandexPay')) row['#Fintech_Type'] = 'yandexPay';
      else if (cls.includes('Fintech_type_pay')) row['#Fintech_Type'] = 'pay';
      else if (cls.includes('Fintech_type_ozon')) row['#Fintech_Type'] = 'ozon';
      
      // View
      if (cls.includes('Fintech_view_extra-short')) row['#Fintech_View'] = 'extra-short';
      else if (cls.includes('Fintech_view_short')) row['#Fintech_View'] = 'short';
      else if (cls.includes('Fintech_view_long')) row['#Fintech_View'] = 'long';
      else row['#Fintech_View'] = 'default';
      
      // InfoIcon
      const infoIcon = fintech.querySelector('.InfoIcon-Icon');
      row['#InfoIcon'] = infoIcon ? 'true' : 'false';
    } else {
      row['#EPriceGroup_Fintech'] = 'false';
      row['#InfoIcon'] = 'false';
    }
    
    // #EPriceBarometer (дублирующая проверка удалена — уже обработано выше)
    // Проверяем что barometer был найден в первом блоке
    if (!row['#ELabelGroup_Barometer']) {
      const barometer = container.querySelector('.EPriceBarometer, [class*="EPriceBarometer"]');
      if (barometer) {
        row['#ELabelGroup_Barometer'] = 'true';
        const cls = barometer.className || '';
        if (cls.includes('below-market') || cls.includes('EPriceBarometer-Cheap')) {
          row['#EPriceBarometer_View'] = 'below-market';
        } else if (cls.includes('in-market') || cls.includes('EPriceBarometer-Average')) {
          row['#EPriceBarometer_View'] = 'in-market';
        } else if (cls.includes('above-market') || cls.includes('EPriceBarometer-Expensive')) {
          row['#EPriceBarometer_View'] = 'above-market';
        }
        row['#EPriceBarometer_isCompact'] = snippetType === 'EShopItem' ? 'true' : 'false';
      } else {
        row['#ELabelGroup_Barometer'] = 'false';
      }
    }
    
    // #EBnpl — блок BNPL (Сплит, Подели и др.)
    // Ищем в EShopItem-Bnpl, ShopInfo-Bnpl (Organic) или просто EBnpl
    const ebnplContainer = container.querySelector('.EShopItem-Bnpl, .ShopInfo-Bnpl, [class*="EShopItem-Bnpl"], .EBnpl');
    if (ebnplContainer) {
      const bnplItems = ebnplContainer.querySelectorAll('.Line-AddonContent, [class*="Line-AddonContent"]');
      const bnplOptions = [];
      
      bnplItems.forEach((item, i) => {
        if (i >= 5) return; // максимум 5 опций
        const text = item.textContent?.trim();
        if (text && !bnplOptions.includes(text)) {
          bnplOptions.push(text);
        }
      });
      
      bnplOptions.forEach((text, i) => {
        row[`#EBnpl-Item-${i + 1}`] = text;
      });
      row['#EBnpl-Count'] = String(bnplOptions.length);
      row['#EBnpl'] = bnplOptions.length > 0 ? 'true' : 'false';
      
      if (bnplOptions.length > 0) {
        console.log(`[EBnpl] Найдено ${bnplOptions.length} опций: ${bnplOptions.join(', ')}`);
      }
    } else {
      row['#EBnpl'] = 'false';
      row['#EBnpl-Count'] = '0';
    }
    
    // #BUTTON логика
    const checkoutBtnSelectors = [
      '[data-market-url-type="market_checkout"]',
      '.MarketCheckout-Button',
      '.EMarketCheckoutButton-Container',
      '.Button_view_primary[href*="/cart"]'
    ];
    let hasCheckout = false;
    for (const selector of checkoutBtnSelectors) {
      if (container.querySelector(selector)) {
        hasCheckout = true;
        break;
      }
    }
    const hasCheckoutModifier = (container.className || '').includes('EShopItem_withCheckout');
    const hasOrganicCheckout = (container.className || '').includes('Organic-Checkout');
    
    if (snippetType === 'EShopItem') {
      // Touch: кнопка скрыта, показываем только для checkout
      // Desktop: кнопка всегда видна
      if (isTouch) {
        const hasCheckoutInTouch = hasCheckout || hasCheckoutModifier;
        row['#BUTTON'] = hasCheckoutInTouch ? 'true' : 'false';
        row['#ButtonView'] = hasCheckoutInTouch ? 'primaryShort' : '';
        row['#ButtonType'] = hasCheckoutInTouch ? 'checkout' : 'shop';
        row['#EButton_visible'] = hasCheckoutInTouch ? 'true' : 'false';
      } else {
        row['#BUTTON'] = 'true';
        row['#ButtonView'] = (hasCheckout || hasCheckoutModifier) ? 'primaryLong' : 'secondary';
        row['#ButtonType'] = (hasCheckout || hasCheckoutModifier) ? 'checkout' : 'shop';
      }
    } else if (snippetType === 'Organic_withOfferInfo' || snippetType === 'Organic') {
      const hasRealCheckout = hasOrganicCheckout || checkoutLabel;
      if (hasRealCheckout) {
        row['#BUTTON'] = 'true';
        row['#ButtonView'] = 'primaryLong';
        row['#EButton_visible'] = 'true';
        row['#ButtonType'] = 'checkout';
      } else {
        row['#BUTTON'] = 'false';
        row['#EButton_visible'] = 'false';
        row['#ButtonType'] = 'shop';
      }
    } else if (snippetType === 'EProductSnippet2') {
      if (checkoutLabel || hasCheckout) {
        row['#BUTTON'] = 'true';
        row['#ButtonView'] = 'primaryShort';
        row['#ButtonType'] = 'checkout';
        row['#EMarketCheckoutLabel'] = 'true';
      } else {
        row['#BUTTON'] = 'false';
        row['#ButtonType'] = 'shop';
        row['#EMarketCheckoutLabel'] = 'false';
      }
    }
    
    // Фильтр: Organic без цены пропускаем
    if ((snippetType === 'Organic' || snippetType === 'Organic_withOfferInfo') && 
        (!row['#OrganicPrice'] || row['#OrganicPrice'].trim() === '')) {
      return null;
    }
    
    // Fallback-цепочки
    if (!row['#OrganicHost'] || row['#OrganicHost'].trim() === '') {
      row['#OrganicHost'] = row['#ShopName'] || '';
    }
    if (!row['#ShopName'] || row['#ShopName'].trim() === '') {
      row['#ShopName'] = row['#OrganicHost'] || '';
    }
    
    // Генерация FaviconImage из host
    if ((!row['#FaviconImage'] || row['#FaviconImage'].trim() === '') && 
        row['#OrganicHost'] && row['#OrganicHost'].trim() !== '') {
      const host = row['#OrganicHost'].replace(/^www\./, '');
      row['#FaviconImage'] = `https://${host}/favicon.ico`;
    }
    
    // Валидация
    const hasSource = (row['#OrganicHost'] && row['#OrganicHost'].trim() !== '') || 
                      (row['#ShopName'] && row['#ShopName'].trim() !== '');
    if (!row['#OrganicTitle'] || !hasSource) {
      return null;
    }
    
    return row;
  }

  /**
   * Находит родительский <li.serp-item> и возвращает его data-cid
   */
  function getSerpItemId(element) {
    let parent = element;
    while (parent) {
      if (parent.tagName === 'LI' && parent.classList && parent.classList.contains('serp-item')) {
        return parent.getAttribute('data-cid') || parent.getAttribute('data-log-node') || null;
      }
      parent = parent.parentElement;
    }
    return null;
  }

  /**
   * Извлекает данные из AdvProductGallery — рекламной галереи товаров
   * Возвращает МАССИВ строк (каждая карточка — отдельная строка)
   */
  function extractAdvProductGallery(container) {
    const results = [];
    
    // Получаем ID родительского serp-item
    const serpItemId = getSerpItemId(container);
    
    // Заголовок галереи
    const headerTitleEl = container.querySelector('.AdvProductGallery-HeaderTitleText');
    const galleryTitle = headerTitleEl ? getTextContent(headerTitleEl) : 'Предложения магазинов';
    
    console.log(`[AdvProductGallery] Извлечение галереи: "${galleryTitle}", serpItemId=${serpItemId}`);
    
    // Находим все карточки внутри галереи
    const cards = container.querySelectorAll('.AdvProductGalleryCard, .EProductSnippet2');
    
    console.log(`[AdvProductGallery] Найдено ${cards.length} карточек`);
    
    for (const card of cards) {
      const row = {
        '#SnippetType': 'EProductSnippet2',
        '#isAdv': 'true',
        '#AdvGalleryTitle': galleryTitle,
        '#serpItemId': serpItemId || ''
      };
      
      // === ИЗОБРАЖЕНИЕ ===
      // Пробуем несколько селекторов для изображения
      const imgSelectors = [
        '.EThumb-Image',
        '.EProductSnippet2-Image img',
        '.EProductSnippet2-Thumb img',
        '.AdvProductGalleryCard-Image img',
        'img[class*="Image"]',
        'img'
      ];
      let imgFound = false;
      for (const selector of imgSelectors) {
        const imgEl = card.querySelector(selector);
        if (imgEl) {
          const src = imgEl.getAttribute('src') || imgEl.getAttribute('data-src');
          if (src && src.length > 10) {
            row['#OrganicImage'] = src.startsWith('http') ? src : `https:${src}`;
            row['#ThumbImage'] = row['#OrganicImage'];
            imgFound = true;
            console.log(`[AdvProductGallery] Изображение найдено через "${selector}": ${src.substring(0, 50)}...`);
            break;
          }
        }
      }
      if (!imgFound) {
        console.log('[AdvProductGallery] ⚠️ Изображение НЕ найдено для карточки');
      }
      
      // === ЦЕНА ===
      const priceEl = card.querySelector('.EPriceGroup-Price .EPrice-Value');
      if (priceEl) {
        const priceText = priceEl.textContent || '';
        const digits = priceText.replace(PRICE_DIGITS_REGEX, '');
        if (digits.length >= 1) {
          row['#OrganicPrice'] = formatPriceWithThinSpace(digits);
          row['#Currency'] = '₽';
        }
      }
      
      // === СТАРАЯ ЦЕНА ===
      const oldPriceEl = card.querySelector('.EPriceGroup-PriceOld .EPrice-Value');
      if (oldPriceEl) {
        const oldPriceText = oldPriceEl.textContent || '';
        const digits = oldPriceText.replace(PRICE_DIGITS_REGEX, '');
        if (digits.length >= 1) {
          row['#OldPrice'] = formatPriceWithThinSpace(digits);
          row['#EPriceGroup_OldPrice'] = 'true';
        }
      }
      
      // === НАЗВАНИЕ ===
      const titleEl = card.querySelector('.EProductSnippet2-Title');
      if (titleEl) {
        row['#OrganicTitle'] = getTextContent(titleEl);
      }
      
      // === МАГАЗИН ===
      const shopEl = card.querySelector('.EShopName .Line-AddonContent');
      if (shopEl) {
        row['#ShopName'] = getTextContent(shopEl);
        row['#OrganicHost'] = row['#ShopName'];
      }
      
      // === FAVICON МАГАЗИНА ===
      const shopFaviconEl = card.querySelector('.EProductSnippet2-ShopInfo .Favicon');
      if (shopFaviconEl && row['#ShopName']) {
        // Генерируем URL фавиконки из домена магазина
        const host = row['#ShopName'].replace(/^www\./, '');
        row['#FaviconImage'] = `https://favicon.yandex.net/favicon/v2/${host}?size=32&stub=1`;
      }
      
      // === URL ===
      const linkEl = card.querySelector('.EProductSnippet2-Overlay[href]');
      if (linkEl) {
        const href = linkEl.getAttribute('href');
        if (href) {
          row['#ProductURL'] = href.startsWith('http') ? href : `https:${href}`;
        }
      }
      
      // Валидация — нужен хотя бы заголовок
      if (!row['#OrganicTitle']) {
        console.log('[AdvProductGallery] Пропуск карточки — нет заголовка');
        continue;
      }
      
      console.log(`[AdvProductGallery] Карточка: "${row['#OrganicTitle']?.substring(0, 40)}..." — ${row['#OrganicPrice']} ₽`);
      
      results.push(row);
    }
    
    console.log(`[AdvProductGallery] Извлечено ${results.length} карточек`);
    
    return results;
  }

  /**
   * Извлекает данные из рекламного органического сниппета (Organic_withAdvLabel)
   * Эти сниппеты отображаются как ESnippet в Figma
   */
  function extractOrganicAdvSnippet(container) {
    // Получаем ID родительского serp-item
    const serpItemId = getSerpItemId(container);
    
    const row = {
      '#SnippetType': 'ESnippet',  // Для Figma — используем ESnippet
      '#isPromo': 'true',
      '#serpItemId': serpItemId || ''
    };

    // === ЗАГОЛОВОК ===
    const titleSelectors = [
      '.OrganicTitleContentSpan',
      '.OrganicTitle-LinkText',
      '.OrganicTitle'
    ];
    for (const selector of titleSelectors) {
      const titleEl = container.querySelector(selector);
      if (titleEl) {
        row['#OrganicTitle'] = getTextContent(titleEl);
        break;
      }
    }
    
    // === ХОСТ / ДОМЕН и PATH ===
    const pathSelectors = [
      '.Path-Item',
      '.Path a',
      '.Organic-Path a'
    ];
    for (const selector of pathSelectors) {
      const pathEl = container.querySelector(selector);
      if (pathEl) {
        const pathText = getTextContent(pathEl);
        // Извлекаем домен из начала строки (до ›)
        const separator = pathText.indexOf('›');
        const host = separator > 0 ? pathText.substring(0, separator).trim() : pathText.trim();
        row['#OrganicHost'] = host;
        row['#ShopName'] = host;
        // Извлекаем OrganicPath (после ›)
        if (separator > 0) {
          row['#OrganicPath'] = pathText.substring(separator + 1).trim();
        }
        break;
      }
    }
    
    // === ТЕКСТ/ОПИСАНИЕ ===
    const textSelectors = [
      '.OrganicTextContentSpan',
      '.OrganicText',
      '.Organic-Text'
    ];
    for (const selector of textSelectors) {
      const textEl = container.querySelector(selector);
      if (textEl) {
        row['#OrganicText'] = getTextContent(textEl);
        break;
      }
    }
    
    // === FAVICON ===
    row['#FaviconImage'] = extractFavicon(container);
    
    // Fallback: генерируем favicon URL из хоста
    if (!row['#FaviconImage'] && row['#OrganicHost']) {
      const host = row['#OrganicHost'].replace(/^www\./, '');
      row['#FaviconImage'] = `https://favicon.yandex.net/favicon/v2/${host}?size=32&stub=1`;
    }
    
    // === ИЗОБРАЖЕНИЕ (Thumb) ===
    const imageSelectors = [
      '.Organic-OfferThumb img',
      '.Organic-OfferThumbImage',
      '.EThumb-Image',
      'img.EThumb-Image',
      '.Organic-Thumb img',
      '[class*="Thumb"] img'
    ];
    const thumbUrl = extractImage(container, imageSelectors);
    if (thumbUrl) {
      row['#OrganicImage'] = thumbUrl;
      row['#ThumbImage'] = thumbUrl;
      row['#withThumb'] = 'true';
      console.log(`[Organic_Adv] Изображение: "${thumbUrl.substring(0, 60)}..."`);
    } else {
      row['#withThumb'] = 'false';
    }
    
    // === ЦИТАТА ИЗ ОТЗЫВА (EQuote) ===
    const quoteSelectors = [
      '.EQuote-Text',
      '.OrganicUgcReviews-QuoteWrapper .EQuote-Text',
      '.EQuote'
    ];
    for (const selector of quoteSelectors) {
      const quoteEl = container.querySelector(selector);
      if (quoteEl) {
        const quoteText = getTextContent(quoteEl);
        if (quoteText) {
          row['#QuoteText'] = quoteText;
          row['#EQuote-Text'] = quoteText;
          row['#withQuotes'] = 'true';
          console.log(`[Organic_Adv] Цитата: "${quoteText}"`);
          break;
        }
      }
    }
    if (!row['#QuoteText']) {
      row['#withQuotes'] = 'false';
    }
    
    // === АВАТАР АВТОРА ЦИТАТЫ ===
    const advAvatarSelectors = [
      '.EQuote-AuthorAvatar',
      '.EQuote-AvatarWrapper img',
      '[class*="EQuote-AuthorAvatar"]',
      '.OrganicUgcReviews-QuoteWrapper .EQuote-AvatarWrapper img'
    ];
    for (const selector of advAvatarSelectors) {
      const avatarEl = container.querySelector(selector);
      if (avatarEl) {
        let avatarUrl = '';
        const srcset = avatarEl.getAttribute('srcset');
        if (srcset) {
          const parts = srcset.split(',').map(s => s.trim());
          for (const part of parts) {
            const [url, scale] = part.split(/\s+/);
            if (scale === '2x' && url) {
              avatarUrl = url;
              break;
            }
          }
          if (!avatarUrl && parts.length > 0) {
            avatarUrl = parts[0].split(/\s+/)[0];
          }
        }
        if (!avatarUrl) {
          avatarUrl = avatarEl.getAttribute('src') || '';
        }
        if (avatarUrl) {
          if (avatarUrl.startsWith('//')) {
            avatarUrl = 'https:' + avatarUrl;
          }
          row['#EQuote-AuthorAvatar'] = avatarUrl;
          console.log(`[Organic_Adv] Аватар цитаты: "${avatarUrl.substring(0, 60)}..."`);
          break;
        }
      }
    }
    
    // === РЕЙТИНГ МАГАЗИНА ===
    const ratingSelectors = [
      '.OrganicUgcReviews-Rating .Line-AddonContent',
      '.ShopInfo-Ugc .RatingOneStar .Line-AddonContent',
      '.RatingOneStar .Line-AddonContent'
    ];
    for (const selector of ratingSelectors) {
      const ratingEl = container.querySelector(selector);
      if (ratingEl) {
        const ratingText = getTextContent(ratingEl);
        const ratingMatch = ratingText.match(/([0-5](?:[.,]\d)?)/);
        if (ratingMatch) {
          row['#ShopInfo-Ugc'] = ratingMatch[1].replace(',', '.');
          break;
        }
      }
    }
    
    // === ОТЗЫВЫ ===
    const reviewsSelectors = [
      '.OrganicUgcReviews-Text',
      '.EReviews',
      '.EReviews-ShopText'
    ];
    for (const selector of reviewsSelectors) {
      const reviewsEl = container.querySelector(selector);
      if (reviewsEl) {
        const text = getTextContent(reviewsEl);
        if (text && text.toLowerCase().includes('отзыв')) {
          row['#EReviews_shopText'] = text.includes('магазин') ? text : `${text} на магазин`;
          // Извлекаем число отзывов
          const numMatch = text.match(/([\d\s,]+)\s*К?\s*(?:отзыв)/i);
          if (numMatch) {
            row['#ReviewsNumber'] = numMatch[1].trim();
          }
          break;
        }
      }
    }
    
    // === ДОСТАВКИ (EDeliveryGroup) ===
    const deliveryGroup = container.querySelector('.EDeliveryGroup:not(.EDeliveryGroup-Item), .ShopInfo-Deliveries');
    if (deliveryGroup) {
      const items = deliveryGroup.querySelectorAll('.EDeliveryGroup-Item');
      const deliveryItems = [];
      items.forEach((item, i) => {
        if (i >= 3) return;
        const text = item.textContent?.trim();
        if (text && !deliveryItems.includes(text)) {
          deliveryItems.push(text);
        }
      });
      
      deliveryItems.forEach((text, i) => {
        row[`#EDeliveryGroup-Item-${i + 1}`] = text;
      });
      row['#EDeliveryGroup-Count'] = String(deliveryItems.length);
      row['#EDeliveryGroup'] = deliveryItems.length > 0 ? 'true' : 'false';
      
      if (deliveryItems.length > 0) {
        console.log(`[Organic_Adv] Доставки (${deliveryItems.length}): ${deliveryItems.join(', ')}`);
      }
    } else {
      row['#EDeliveryGroup'] = 'false';
      row['#EDeliveryGroup-Count'] = '0';
    }
    
    // === ОФИЦИАЛЬНЫЙ МАГАЗИН ===
    // ВАЖНО: Verified_type_goods — это НЕ "Официальный магазин"!
    // Это badge "Сайт специализируется на продаже товаров"
    // Официальный магазин — это .OfficialShop (отдельный класс)
    const officialShopEl = container.querySelector('.OfficialShop, [class*="official-vendor"]');
    if (officialShopEl) {
      row['#OfficialShop'] = 'true';
      console.log('[Organic_Adv] Официальный магазин: true');
    } else {
      row['#OfficialShop'] = 'false';
    }
    
    // Verified badge (Сайт специализируется на продаже товаров) — отдельный флаг
    const verifiedEl = container.querySelector('.Verified_type_goods, .Verified');
    if (verifiedEl) {
      row['#VerifiedType'] = 'goods';
      row['#isVerified'] = 'true';
    }
    
    // === САЙТЛИНКИ ===
    const sitelinksContainer = container.querySelector('.Sitelinks');
    if (sitelinksContainer) {
      row['#Sitelinks'] = 'true';
      // FIX: правильный селектор — .Sitelinks-Title напрямую или через .Sitelinks-Item a
      const sitelinkItems = sitelinksContainer.querySelectorAll('.Sitelinks-Title, .Sitelinks-Item a.Sitelinks-Title');
      const sitelinks = [];
      sitelinkItems.forEach((item, i) => {
        if (i >= 4) return; // Максимум 4 сайтлинка
        const text = getTextContent(item);
        if (text) {
          sitelinks.push(text);
          row[`#Sitelink_${i + 1}`] = text;
        }
      });
      row['#SitelinksCount'] = String(sitelinks.length);
      console.log(`[Organic_Adv] Найдено ${sitelinks.length} сайтлинков:`, sitelinks);
    } else {
      row['#Sitelinks'] = 'false';
      row['#SitelinksCount'] = '0';
    }
    
    // === ЦЕНА (EPriceGroup) ===
    const prices = extractPrices(container);
    if (prices.price) {
      row['#OrganicPrice'] = prices.price;
      row['#Currency'] = prices.currency;
      row['#withPrice'] = 'true';
      if (prices.oldPrice) {
        row['#OldPrice'] = prices.oldPrice;
        row['#EPriceGroup_OldPrice'] = 'true';
      }
    }
    
    // === ПРОМО-БЛОК ===
    const promoSelectors = [
      '.PromoOffer .InfoSection-Text',
      '.InfoSection-Text',
      '.PromoOffer'
    ];
    for (const selector of promoSelectors) {
      const promoEl = container.querySelector(selector);
      if (promoEl) {
        const promoText = getTextContent(promoEl);
        if (promoText) {
          row['#Promo'] = promoText;
          row['#withPromo'] = 'true';
          console.log(`[Organic_Adv] Промо-блок: "${promoText}"`);
          break;
        }
      }
    }
    if (!row['#Promo']) {
      row['#withPromo'] = 'false';
    }
    
    // === МЕТКА ПРОМО ===
    const advLabelEl = container.querySelector('.AdvLabel-Text, .OrganicAdvLabel');
    if (advLabelEl) {
      row['#AdvLabel'] = getTextContent(advLabelEl) || 'Промо';
    }
    
    // === URL ===
    const productURL = extractProductURL(container);
    if (productURL) {
      row['#ProductURL'] = productURL;
    }
    
    // Валидация
    if (!row['#OrganicTitle'] && !row['#OrganicHost']) {
      console.log('[Organic_Adv] Пропуск — нет заголовка или хоста');
      return null;
    }
    
    // Fallback для #OrganicText
    if (!row['#OrganicText'] && row['#OrganicTitle']) {
      row['#OrganicText'] = row['#OrganicTitle'];
    }
    
    console.log(`[Organic_Adv] Извлечён сниппет: "${row['#OrganicTitle']?.substring(0, 40)}..."`);
    
    return row;
  }

  /**
   * Извлекает панель быстрых фильтров EQuickFilters
   * @returns {Object|null} Объект с данными фильтров или null
   */
  function extractEQuickFilters() {
    // Ищем панель фильтров — может быть .EQuickFilters или .ProductsModePanel-Filters
    const filtersPanel = document.querySelector('.ProductsModePanel-Filters, .EQuickFilters');
    if (!filtersPanel) {
      return null;
    }

    console.log('[EQuickFilters] Найдена панель фильтров');

    const result = {
      '#SnippetType': 'EQuickFilters',
      '#FilterButtons': []  // Массив объектов {text, type}
    };

    // Кнопка "Все фильтры" (EAllFiltersButton)
    const allFiltersBtn = filtersPanel.querySelector('.EAllFiltersButton button');
    if (allFiltersBtn) {
      result['#AllFiltersButton'] = 'true';
      console.log('[EQuickFilters] Найдена кнопка "Все фильтры"');
    }

    // Кнопки быстрых фильтров
    const quickFiltersContainer = filtersPanel.querySelector('.EQuickFilters') || filtersPanel;
    const filterItems = quickFiltersContainer.querySelectorAll('.EQuickFilters-Item');
    
    for (const item of filterItems) {
      const btn = item.querySelector('button');
      if (!btn) continue;
      
      // Определяем тип кнопки по классам
      let buttonType = 'dropdown'; // default
      
      if (item.classList.contains('EQuickFilters-SortItem')) {
        // Кнопка сортировки (без иконки)
        buttonType = 'sort';
      } else if (item.classList.contains('EQuickFilters-Suggest') || 
                 btn.classList.contains('ESuggestButton') ||
                 btn.classList.contains('Button_view_pseudo')) {
        // Suggest-кнопка (Outline стиль)
        buttonType = 'suggest';
      } else if (btn.classList.contains('EQuickFilters-Open') || 
                 btn.querySelector('.EFilterButton-Icon_pos_right')) {
        // Dropdown с иконкой справа
        buttonType = 'dropdown';
      }
      
      // Текст кнопки — в .EFilterButton-Text или .ESuggestButton-Text
      const textEl = btn.querySelector('.EFilterButton-Text, .ESuggestButton-Text');
      const text = textEl ? textEl.textContent.trim() : '';
      
      if (text) {
        result['#FilterButtons'].push({ text, type: buttonType });
        console.log(`[EQuickFilters] Кнопка: "${text}" (${buttonType})`);
      }
    }

    console.log(`[EQuickFilters] Найдено ${result['#FilterButtons'].length} кнопок фильтров`);

    // Преобразуем массив в отдельные поля для совместимости
    result['#FilterButtons'].forEach((btn, i) => {
      result[`#FilterButton_${i + 1}`] = btn.text;
      result[`#FilterButtonType_${i + 1}`] = btn.type;
    });
    result['#FilterButtonsCount'] = String(result['#FilterButtons'].length);

    return result;
  }

  /**
   * Извлекает данные из одного контейнера
   * Возвращает объект, массив объектов или null
   */
  /**
   * Определяет тип контейнера serp-item по классам и атрибутам
   */
  function getSerpItemContainerType(serpItem) {
    const className = serpItem.className || '';
    const fastName = serpItem.getAttribute('data-fast-name') || '';
    const fastSubtype = serpItem.getAttribute('data-fast-subtype') || '';
    const dataCid = serpItem.getAttribute('data-cid') || '';
    const dataLogNode = serpItem.getAttribute('data-log-node') || '';
    
    // EntityOffers — группа офферов от разных магазинов
    if (className.includes('entity-offers') || fastName === 'entity_offers') {
      return 'EntityOffers';
    }
    
    // AdvProductGallery — рекламная галерея (проверяем раньше других!)
    const advGallery = serpItem.querySelector('.AdvProductGallery');
    if (advGallery) {
      console.log(`[getSerpItemContainerType] AdvProductGallery найден! cid=${dataCid}, logNode=${dataLogNode}`);
      return 'AdvProductGallery';
    }
    
    // ВАЖНО: Проверяем содержимое ПЕРЕД проверкой data-fast-name!
    // products_mode_constr может содержать как EProductSnippet2 (плитки), так и EShopList (список магазинов)
    
    // Подсчитываем EProductSnippet2 и EShopItem
    const productItems = serpItem.querySelectorAll('.EProductSnippet2.ProductTile-Item, .ProductTile-Item.EProductSnippet2');
    const shopItems = serpItem.querySelectorAll('.EShopItem');
    
    console.log(`[getSerpItemContainerType] cid=${dataCid}: EProductSnippet2=${productItems.length}, EShopItem=${shopItems.length}, fastName=${fastName}`);
    
    // EShopList — список магазинов (множественные EShopItem)
    // Приоритет выше чем ProductsTiles по data-fast-name, потому что products_mode_constr может содержать EShopList!
    if (shopItems.length > 1 && productItems.length === 0) {
      console.log(`[getSerpItemContainerType] EShopList найден! ${shopItems.length} магазинов, cid=${dataCid}`);
      return 'EShopList';
    }
    
    // ProductsTiles — плитки товаров (EProductSnippet2)
    if (productItems.length > 1) {
      console.log(`[getSerpItemContainerType] ProductsTiles найден! ${productItems.length} товаров, cid=${dataCid}`);
      return 'ProductsTiles';
    }
    
    // ProductsTiles по data-fast-name/subtype (только если есть хотя бы один EProductSnippet2)
    if (fastSubtype.includes('products_tiles') || 
        fastSubtype.includes('products_additional') ||
        fastSubtype.includes('ecommerce_offers') ||
        fastName === 'products_mode_constr') {
      // Если есть EProductSnippet2 — ProductsTiles
      if (productItems.length >= 1) {
        console.log(`[getSerpItemContainerType] ProductsTiles по fastName="${fastName}", ${productItems.length} товаров`);
        return 'ProductsTiles';
      }
      // Если нет EProductSnippet2, но есть EShopItem — EShopList
      if (shopItems.length >= 1) {
        console.log(`[getSerpItemContainerType] EShopList (в products_mode), ${shopItems.length} магазинов`);
        return 'EShopList';
      }
      // Fallback на ProductsTiles если нет ни того ни другого (редкий случай)
      console.log(`[getSerpItemContainerType] ProductsTiles (пустой?) по fastName="${fastName}"`);
      return 'ProductsTiles';
    }
    
    // ProductsTiles — также проверяем наличие класса ProductsTiles/ProductsModeTiles внутри
    const hasProductsTilesClass = serpItem.querySelector('.ProductsTiles, .ProductsModeTiles, .ProductsModeRoot');
    if (hasProductsTilesClass && productItems.length > 0) {
      console.log(`[getSerpItemContainerType] ProductsTiles по классу! ${productItems.length} товаров, cid=${dataCid}`);
      return 'ProductsTiles';
    }
    
    // Логирование для отладки
    const hasAdvClass = serpItem.innerHTML.includes('AdvProductGallery');
    if (hasAdvClass) {
      console.log(`[getSerpItemContainerType] ⚠️ innerHTML содержит AdvProductGallery, но querySelector не нашёл! cid=${dataCid}, logNode=${dataLogNode}`);
      console.log(`[getSerpItemContainerType] Первые 500 символов innerHTML:`, serpItem.innerHTML.substring(0, 500));
    }
    
    // Одиночный сниппет
    return 'Single';
  }

  /**
   * Извлекает данные из serp-item (li элемента)
   * Возвращает объект или массив объектов
   * @param {Element} serpItem - контейнер serp-item
   * @param {string} platform - платформа ('desktop' или 'touch')
   */
  function extractRowData(serpItem, platform) {
    platform = platform || 'desktop';
    
    // Используем data-cid или data-log-node как fallback
    const serpItemId = serpItem.getAttribute('data-cid') || serpItem.getAttribute('data-log-node') || '';
    const containerType = getSerpItemContainerType(serpItem);
    
    console.log(`[extractRowData] serpItemId=${serpItemId}, containerType=${containerType}, platform=${platform}`);
    
    // === EntityOffers — группа сниппетов с заголовком ===
    // Два варианта: 
    // 1. EntityOffersOrganic — содержит .Organic.Organic_withOfferInfo элементы
    // 2. Стандартный EntityOffers — содержит .EShopItem элементы
    if (containerType === 'EntityOffers') {
      const results = [];
      
      // Проверяем вариант EntityOffersOrganic
      const isOrganicVariant = serpItem.querySelector('.EntityOffersOrganic') !== null;
      
      // Извлекаем заголовок — разные селекторы для разных вариантов
      let entityTitle = 'Цены по вашему запросу';
      const titleSelectors = [
        '.EntitySearchTitle',
        '.DebrandingTitle-Text',
        '.GoodsHeader h2',
        '.EntityOffersOrganic-UnitedHeader h2'
      ];
      for (const selector of titleSelectors) {
        const titleEl = serpItem.querySelector(selector);
        if (titleEl) {
          entityTitle = titleEl.textContent.trim();
          break;
        }
      }
      console.log(`[EntityOffers] Заголовок: "${entityTitle}", isOrganicVariant=${isOrganicVariant}`);
      
      if (isOrganicVariant) {
        // === Вариант EntityOffersOrganic ===
        // Содержит .Organic.Organic_withOfferInfo элементы
        // Для desktop → ESnippet, для touch → EShopItem
        const organicItems = serpItem.querySelectorAll('.Organic.Organic_withOfferInfo');
        console.log(`[EntityOffers] EntityOffersOrganic: найдено ${organicItems.length} Organic элементов`);
        
        // Тип сниппета зависит от платформы
        const snippetType = platform === 'desktop' ? 'ESnippet' : 'EShopItem';
        
        for (const organic of organicItems) {
          // Извлекаем данные как стандартный сниппет
          const row = extractStandardSnippet(organic, snippetType, platform);
          if (row) {
            row['#serpItemId'] = serpItemId;
            row['#containerType'] = 'EntityOffers';
            row['#EntityOffersTitle'] = entityTitle;
            row['#SnippetType'] = snippetType; // Принудительно устанавливаем тип
            results.push(row);
            console.log(`[EntityOffers] Organic → ${snippetType}: "${(row['#OrganicTitle'] || '').substring(0, 40)}..."`);
          }
        }
      } else {
        // === Стандартный вариант EntityOffers ===
        // Содержит .EShopItem элементы
        const shopItems = serpItem.querySelectorAll('.EShopItem');
        console.log(`[EntityOffers] Стандартный: найдено ${shopItems.length} EShopItem внутри`);
        
        for (const shopItem of shopItems) {
          const row = extractStandardSnippet(shopItem, 'EShopItem', platform);
          if (row) {
            row['#serpItemId'] = serpItemId;
            row['#containerType'] = 'EntityOffers';
            row['#EntityOffersTitle'] = entityTitle;
            results.push(row);
          }
        }
      }
      
      return results.length > 0 ? results : null;
    }
    
    // === ProductsTiles — плитки EProductSnippet2 ===
    if (containerType === 'ProductsTiles') {
      const results = [];
      // Ищем все EProductSnippet2 (только верхнего уровня, не вложенные)
      // Используем :scope для ограничения поиска только прямыми или непосредственными потомками
      const allProducts = serpItem.querySelectorAll('.EProductSnippet2.ProductTile-Item, .ProductTile-Item.EProductSnippet2');
      
      // Фильтруем: оставляем только те, что НЕ вложены в другой EProductSnippet2
      const products = Array.from(allProducts).filter(el => {
        let parent = el.parentElement;
        while (parent && parent !== serpItem) {
          if (parent.classList && parent.classList.contains('EProductSnippet2')) {
            return false; // Вложенный — пропускаем
          }
          parent = parent.parentElement;
        }
        return true;
      });
      
      console.log(`[ProductsTiles] Найдено ${allProducts.length} элементов, после фильтрации: ${products.length}`);
      
      let skippedCount = 0;
      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const row = extractStandardSnippet(product, 'EProductSnippet2', platform);
        if (row) {
          row['#serpItemId'] = serpItemId;
          row['#containerType'] = 'ProductsTiles';
          results.push(row);
          console.log(`[ProductsTiles] [${i+1}] ✓ "${(row['#OrganicTitle'] || '').substring(0, 40)}..." — ${row['#ShopName']}`);
        } else {
          skippedCount++;
          // Логируем почему пропущен
          const titleEl = product.querySelector('.EProductSnippet2-Title');
          const shopEl = product.querySelector('.EShopName');
          console.log(`[ProductsTiles] [${i+1}] ✗ ПРОПУЩЕН: title="${titleEl ? titleEl.textContent?.substring(0, 30) : 'N/A'}", shop="${shopEl ? shopEl.textContent : 'N/A'}"`);
        }
      }
      
      if (skippedCount > 0) {
        console.log(`[ProductsTiles] Пропущено ${skippedCount} из ${products.length} продуктов`);
      }
      
      return results.length > 0 ? results : null;
    }
    
    // === AdvProductGallery — рекламная галерея ===
    if (containerType === 'AdvProductGallery') {
      const gallery = serpItem.querySelector('.AdvProductGallery');
      if (gallery) {
        const results = extractAdvProductGallery(gallery);
        // Добавляем serpItemId ко всем результатам
        if (Array.isArray(results)) {
          results.forEach(row => {
            row['#serpItemId'] = serpItemId;
            row['#containerType'] = 'AdvProductGallery';
          });
        }
        return results;
      }
    }
    
    // === EShopList — список магазинов (множественные EShopItem) ===
    if (containerType === 'EShopList') {
      const results = [];
      
      // Извлекаем заголовок группы (например "Цены в магазинах")
      let shopListTitle = 'Цены в магазинах'; // default
      const titleSelectors = [
        '.DebrandingTitle-Text',
        '.GoodsHeader h2',
        '.Products-Title h2',
        '.EntitySearchTitle',
        '.ProductsTiles h2'
      ];
      for (const selector of titleSelectors) {
        const titleEl = serpItem.querySelector(selector);
        if (titleEl) {
          shopListTitle = titleEl.textContent?.trim() || shopListTitle;
          console.log(`[EShopList] Заголовок найден: "${shopListTitle}" (селектор: ${selector})`);
          break;
        }
      }
      
      const shopItems = serpItem.querySelectorAll('.EShopItem');
      console.log(`[EShopList] Найдено ${shopItems.length} EShopItem внутри, заголовок="${shopListTitle}"`);
      
      for (let i = 0; i < shopItems.length; i++) {
        const shopItem = shopItems[i];
        const row = extractStandardSnippet(shopItem, 'EShopItem', platform);
        if (row) {
          row['#serpItemId'] = serpItemId;
          row['#containerType'] = 'EShopList';
          row['#EShopListTitle'] = shopListTitle; // Добавляем заголовок группы
          results.push(row);
          const shopName = row['#ShopName'] || 'N/A';
          const price = row['#OrganicPrice'] || row['#EProductSnippet2_Price'] || 'N/A';
          console.log(`[EShopList] [${i+1}] ✓ "${shopName}" — ${price}`);
        } else {
          console.log(`[EShopList] [${i+1}] ✗ ПРОПУЩЕН`);
        }
      }
      
      console.log(`[EShopList] Извлечено ${results.length} из ${shopItems.length} EShopItem`);
      return results.length > 0 ? results : null;
    }
    
    // === Single — одиночный сниппет ===
    // Определяем тип по содержимому
    const innerContent = serpItem.querySelector(
      '.Organic, .ESnippet, .EOfferItem, .EShopItem, .EProductSnippet2'
    );
    
    if (!innerContent) {
      console.log(`[extractRowData] serpItemId=${serpItemId}: нет известного контента`);
      return null;
    }
    
    const snippetType = getSnippetType(innerContent);
    console.log(`[extractRowData] serpItemId=${serpItemId}: snippetType=${snippetType}`);
    
    // Промо-сниппеты
    if (snippetType === 'Organic_Adv') {
      const row = extractOrganicAdvSnippet(innerContent);
      if (row) {
        row['#serpItemId'] = serpItemId;
      }
      return row;
    }
    
    // EOfferItem
    if (snippetType === 'EOfferItem') {
      const row = extractEOfferItem(innerContent);
      if (row) {
        row['#serpItemId'] = serpItemId;
      }
      return row;
    }
    
    // Органические сниппеты → ESnippet
    if (snippetType === 'Organic' || snippetType === 'Organic_withOfferInfo') {
      const row = extractStandardSnippet(innerContent, 'ESnippet', platform);
      if (row) {
        row['#serpItemId'] = serpItemId;
        row['#SnippetType'] = 'ESnippet';  // Принудительно ESnippet
      }
      return row;
    }
    
    // Остальные типы
    const row = extractStandardSnippet(innerContent, snippetType, platform);
    if (row) {
      row['#serpItemId'] = serpItemId;
    }
    return row;
  }

  /**
   * Фильтрует вложенные контейнеры
   */
  function filterTopLevelContainers(containers) {
    if (containers.length <= 1) return containers;
    
    const containerSet = new Set(containers);
    const topLevel = [];
    
    for (const container of containers) {
      let isNested = false;
      let parent = container.parentElement;
      let depth = 0;
      
      while (parent && depth < 50) {
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
   * Дедуплицирует строки
   */
  function deduplicateRows(rows) {
    const unique = new Map();
    let duplicatesRemoved = 0;

    for (const row of rows) {
      let key = '';
      let keyType = '';
      
      const snippetType = row['#SnippetType'] || '';
      const isMultiShopType = snippetType === 'EShopItem' || snippetType === 'EOfferItem';
      
      // === СПЕЦИАЛЬНАЯ ЛОГИКА ДЛЯ EShopItem/EOfferItem ===
      // Это карточки РАЗНЫХ магазинов для ОДНОГО товара — нужно сохранить все!
      // Ключ ДОЛЖЕН включать ShopName, чтобы не терять разные магазины
      if (isMultiShopType) {
        const shop = (row['#ShopName'] || row['#OrganicHost'] || '').trim();
        const price = (row['#OrganicPrice'] || '').trim();
        // Для EShopItem/EOfferItem: магазин + цена = уникальная карточка
        // (один магазин может иметь разные цены на разные SKU, но для одного запроса обычно одна цена)
        key = `shop:${shop}|${price}`;
        keyType = 'shop+price';
      } else {
        // === СТАНДАРТНАЯ ЛОГИКА ДЛЯ ДРУГИХ ТИПОВ ===
        // 1. Приоритет: do-waremd5 из URL (уникален для каждого оффера продавца)
        const productURL = row['#ProductURL'] || '';
        if (productURL.trim()) {
          // Извлекаем do-waremd5 — уникальный идентификатор оффера
          const waremd5Match = productURL.match(/do-waremd5=([^&]+)/);
          if (waremd5Match) {
            key = `waremd5:${waremd5Match[1]}`;
            keyType = 'waremd5';
          } else {
            // Fallback: используем полный путь product/sku + hatter_id
            const hatterMatch = productURL.match(/hatter_id=([^&]+)/);
            if (hatterMatch) {
              const skuMatch = productURL.match(/product\/(\d+)\/sku\/(\d+)/);
              key = skuMatch ? `sku:${skuMatch[2]}:${hatterMatch[1]}` : productURL;
              keyType = 'sku+hatter';
            } else {
              key = productURL;
              keyType = 'URL';
            }
          }
        }
      
        // 2. Fallback: title + shop + price + image (максимально уникальная комбинация)
        if (!key) {
          const title = (row['#OrganicTitle'] || '').trim();
          const shop = (row['#ShopName'] || row['#OrganicHost'] || '').trim();
          const price = (row['#OrganicPrice'] || '').trim();
          const image = (row['#OrganicImage'] || '').trim();
        
          // Используем хеш изображения если есть
          const imageHash = image ? image.slice(-20) : '';
        
          key = `${title}|${shop}|${price}|${imageHash}`;
          keyType = 'title|shop|price|img';
        }
      }

      if (unique.has(key)) {
        duplicatesRemoved++;
        const existing = unique.get(key);
        console.log(`[Dedup] ⚠️ Дубликат #${duplicatesRemoved} (по ${keyType}):`);
        console.log(`  Существующий: "${(existing['#OrganicTitle'] || '').substring(0, 40)}..." — ${existing['#ShopName']} — ${existing['#OrganicPrice']}₽`);
        console.log(`  Новый (пропущен): "${(row['#OrganicTitle'] || '').substring(0, 40)}..." — ${row['#ShopName']} — ${row['#OrganicPrice']}₽`);
        console.log(`  Ключ: ${key.substring(0, 80)}...`);
        
        // Приоритет строке с изображением
        if (row['#OrganicImage'] && !existing['#OrganicImage']) {
          console.log(`  → Заменяем на новый (есть изображение)`);
          unique.set(key, row);
        }
      } else {
        unique.set(key, row);
      }
    }

    if (duplicatesRemoved > 0) {
      console.log(`[Dedup] Удалено дубликатов: ${duplicatesRemoved}, осталось: ${unique.size}`);
    }

    return Array.from(unique.values());
  }

  // ============================================================================
  // MAIN ENTRY POINT
  // ============================================================================

  /**
   * Главная функция — извлекает все сниппеты со страницы
   */
  function extractSnippets() {
    console.log('🔍 [Content] Начинаю парсинг страницы...');
    
    // Проверяем, что это страница Яндекса (yandex.ru, yandex.com, ya.ru)
    const hostname = window.location.hostname;
    const isYandex = hostname.includes('yandex') || hostname.includes('ya.ru');
    if (!isYandex) {
      console.log('⚠️ [Content] Не страница Яндекса');
      return { rows: [], error: 'Не страница Яндекса' };
    }
    
    // Определяем платформу (desktop/touch)
    const platform = detectPlatform();
    console.log(`📱 [Content] Платформа: ${platform}`);
    
    // Получаем поисковый запрос
    let query = '';
    try {
      // Touch версия может иметь другой селектор для поиска
      const queryEl = document.querySelector('.HeaderForm-Input') || 
                      document.querySelector('.HeaderPhone-Input') ||
                      document.querySelector('input[name="text"]');
      if (queryEl) {
        query = queryEl.value || queryEl.getAttribute('value') || '';
      }
    } catch (e) {}
    console.log(`🔎 [Content] Поисковый запрос: "${query}"`);
    
    // Находим контейнеры
    const allContainers = document.querySelectorAll(CONTAINER_SELECTORS);
    const containerArray = Array.from(new Set(allContainers));
    const containers = filterTopLevelContainers(containerArray);
    console.log(`📦 [Content] Найдено контейнеров: ${containers.length}`);
    
    // Детальное логирование каждого контейнера
    containers.forEach((c, i) => {
      const cid = c.getAttribute('data-cid') || 'N/A';
      const logNode = c.getAttribute('data-log-node') || 'N/A';
      const hasAdvGallery = c.querySelector('.AdvProductGallery') !== null;
      const hasShopItems = c.querySelectorAll('.EShopItem').length;
      const hasProductTiles = c.querySelector('.ProductTile-Item, .EProductSnippet2') !== null;
      console.log(`  [${i+1}] cid=${cid}, logNode=${logNode.substring(0, 15)}, AdvGallery=${hasAdvGallery}, EShopItem=${hasShopItems}, ProductTile=${hasProductTiles}`);
    });
    
    // Извлекаем данные
    const results = [];
    
    // Сначала извлекаем EQuickFilters (панель фильтров)
    const quickFilters = extractEQuickFilters();
    if (quickFilters) {
      if (query) quickFilters['#query'] = query;
      quickFilters['#platform'] = platform;
      results.push(quickFilters);
    }
    
    // Затем извлекаем сниппеты
    for (const container of containers) {
      const rowOrRows = extractRowData(container, platform);
      if (rowOrRows) {
        // extractRowData может вернуть массив (для AdvProductGallery) или объект
        if (Array.isArray(rowOrRows)) {
          for (const row of rowOrRows) {
            if (row) {
              if (query) row['#query'] = query;
              row['#platform'] = platform;
              results.push(row);
            }
          }
        } else {
          if (query) rowOrRows['#query'] = query;
          rowOrRows['#platform'] = platform;
          results.push(rowOrRows);
        }
      }
    }
    
    // Дедуплицируем
    const finalResults = deduplicateRows(results);
    console.log(`✅ [Content] Извлечено сниппетов: ${finalResults.length}`);
    
    // Статистика по типам
    const stats = {};
    for (const row of finalResults) {
      const type = row['#SnippetType'] || 'Unknown';
      stats[type] = (stats[type] || 0) + 1;
    }
    console.log('📊 [Content] Статистика:', stats);
    
    return { rows: finalResults };
  }

  // Выполняем парсинг и возвращаем результат
  return extractSnippets();
})();
