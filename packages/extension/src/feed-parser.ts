/**
 * feed-parser.ts — парсер DOM ритм-фида ya.ru → FeedCardRow[]
 *
 * Запускается в content script браузерного расширения.
 * Селекторы основаны на анализе сохранённого HTML (март 2026).
 *
 * CSS-классы в ритм-фиде имеют суффикс `--rythm-feed-{hash}`,
 * поэтому используем `[class*="..."]` селекторы.
 */

// Minimal type definitions (canonical types live in packages/plugin/src/types/feed-card-types.ts)
type FeedCardType = 'post' | 'video' | 'market' | 'advert' | 'product' | 'collection';
type FeedCardSize = 'xs' | 's' | 'm' | 'ml' | 'l' | 'xl';
type FeedCardRow = Record<string, string>;

// ============================================================================
// SELECTORS — CSS-паттерны для поиска элементов
// ============================================================================

const SEL = {
  /** Контейнер masonry-фида */
  feedContainer: '[class*="masonry-feed--rythm-feed"]',

  /** Отдельная карточка в masonry */
  feedItem: '[class*="masonry-feed__item--rythm-feed"]',

  // --- Определение типа карточки ---
  marketCard: '[data-test-id="market-card"], .EcomFeedMarketCard',
  advertCard: '[class*="advert-card--rythm-feed"]',
  contentCard: '[class*="rythm-card__content--rythm-feed"]',

  // --- Суб-фичи контентных карточек ---
  videoIndicator: '[class*="card-content__sound--rythm-feed"]',
  ecomSlider: '.EcomFeedSlider',
  productsPreview: '[class*="post-products-preview"]',

  // --- Данные карточки ---
  cardImage:
    '[class*="card-content__image--rythm-feed"] img, [class*="card-content__image--rythm-feed"]',
  cardTitle: '[class*="card-actions__description--rythm-feed"]',

  // --- Product info ---
  price: '.EcomFeedDiscountPrice, [class*="ecom-feed-price"]',
  oldPrice: '[class*="price-old"], [class*="OldPrice"]',
  discount: '.LabelDiscount, [class*="discount"]',

  // --- Source (footer) ---
  source: '[class*="rythm-card__source--rythm-feed"], .EcomFeedCardSource',
  sourceAvatar: '[class*="rythm-card__source--rythm-feed"] img',
  sourceText: '[class*="card-actions__info--rythm-feed"]',

  // --- Market-specific ---
  marketImage: '.EcomFeedMarketCard img',
  marketTitle: '.EcomFeedMarketCard [class*="title"], .EcomFeedMarketCard h3 a',
  marketPrice: '.EcomFeedMarketCard [class*="price"]',
  marketSource: '.EcomFeedMarketCard [class*="source"], .EcomFeedMarketCard .EcomFeedCardSource',

  // --- Advert-specific ---
  advertImage: '[class*="advert-card__content--rythm-feed"] img',
  advertDomain: '[class*="advert-card--rythm-feed"] [class*="source"]',
} as const;

// ============================================================================
// SIZE DETECTION
// ============================================================================

function detectCardSize(element: Element): FeedCardSize {
  const cls = element.className || '';
  if (cls.includes('item-size_xl')) return 'xl';
  if (cls.includes('item-size_ml')) return 'ml';
  if (cls.includes('item-size_l')) return 'l';
  if (cls.includes('item-size_m')) return 'm';
  if (cls.includes('item-size_s--') || cls.includes('item-size_s ')) return 's';
  if (cls.includes('item-size_xs')) return 'xs';
  return 'm'; // fallback
}

// ============================================================================
// TYPE DETECTION
// ============================================================================

function detectCardType(element: Element): FeedCardType {
  // Market (Яндекс Маркет) — самый специфичный селектор
  if (element.querySelector(SEL.marketCard)) {
    return 'market';
  }

  // Advert (реклама)
  if (element.querySelector(SEL.advertCard)) {
    return 'advert';
  }

  // Content cards — различаем по суб-фичам
  if (element.querySelector(SEL.contentCard)) {
    const hasVideo = !!element.querySelector(SEL.videoIndicator);
    const hasSlider = !!element.querySelector(SEL.ecomSlider);
    const hasProducts = !!element.querySelector(SEL.productsPreview);

    // Video content (play icon, sound toggle)
    if (hasVideo && !hasSlider) {
      return 'video';
    }

    // Post with product carousel or product preview
    if (hasSlider || hasProducts) {
      return 'post';
    }

    // Generic content — treat as post
    return 'post';
  }

  return 'post'; // fallback
}

// ============================================================================
// FIELD EXTRACTION
// ============================================================================

/** Безопасно достаёт текст из первого найденного элемента */
function getText(parent: Element, selector: string): string {
  const el = parent.querySelector(selector);
  return el?.textContent?.trim() || '';
}

/** Достаёт src изображения (из img.src или background-image) */
function getImageUrl(parent: Element, selector: string): string {
  const el = parent.querySelector(selector);
  if (!el) return '';

  // Прямой img
  if (el.tagName === 'IMG') {
    return (el as HTMLImageElement).src || '';
  }

  // img внутри контейнера
  const img = el.querySelector('img');
  if (img?.src) return img.src;

  // background-image
  const style = el.getAttribute('style') || '';
  const match = style.match(/background-image:\s*url\(["']?([^"')]+)/);
  return match?.[1] || '';
}

/** Извлекает цену из текста ("5 999 ₽" → "5 999") */
function extractPrice(text: string): string {
  if (!text) return '';
  const digits = text.replace(/[^\d\s]/g, '').trim();
  return digits || '';
}

/**
 * Get clean price text from a price container.
 * Prefers .Price-Value (clean formatted text) over parent container
 * which may include doubled accessibility-hidden text.
 */
function getPriceText(parent: Element, selector: string): string {
  const container = parent.querySelector(selector);
  if (!container) return '';
  // Try leaf-level .Price-Value first (avoids "222600 ₽222 600 ₽" duplication)
  var leaf = container.querySelector('.Price-Value');
  if (leaf) return leaf.textContent?.trim() || '';
  return container.textContent?.trim() || '';
}

/**
 * Map image natural dimensions to closest standard Figma ratio value.
 * Component "Image Ratio" accepts: '1:1', '3:4', '4:3', '9:16', '16:9'
 */
function detectRatio(width: number, height: number): string {
  var r = width / height;
  // Sorted by distance from common ratios
  if (r >= 1.5) return '16:9'; // >= 1.5 → landscape
  if (r >= 1.1) return '4:3'; // 1.1–1.5 → slightly wide
  if (r >= 0.85) return '1:1'; // 0.85–1.1 → square-ish
  if (r >= 0.6) return '3:4'; // 0.6–0.85 → portrait
  return '9:16'; // < 0.6 → tall portrait (video)
}

// ============================================================================
// CARD PARSERS
// ============================================================================

function parseMarketCard(element: Element, index: number): FeedCardRow {
  const row: FeedCardRow = {
    '#Feed_CardType': 'market',
    '#Feed_CardSize': detectCardSize(element),
    '#Feed_Platform': 'desktop',
    '#Feed_Index': String(index),
  };

  row['#Feed_ImageUrl'] = getImageUrl(element, SEL.marketImage);

  // Detect image ratio from natural dimensions
  var marketImg = element.querySelector('.EcomFeedMarketCard img') as HTMLImageElement | null;
  if (marketImg && marketImg.naturalWidth && marketImg.naturalHeight) {
    row['#Feed_ImageRatio'] = detectRatio(marketImg.naturalWidth, marketImg.naturalHeight);
  }

  var titleEl =
    element.querySelector('.EcomFeedMarketCard-Title') ||
    element.querySelector('.EcomFeedMarketCard h3 a');
  row['#Feed_Title'] = titleEl?.textContent?.trim() || '';

  row['#Feed_SourceName'] = 'Яндекс Маркет';
  row['#Feed_SourceAvatarUrl'] = getImageUrl(element, '.EcomFeedCardSource img');
  row['#Feed_SourceDomain'] = 'market.yandex.ru';

  // Green price (with Yandex Pay card) — e.g. "12 177"
  var greenPrice = getText(element, '[data-test-id="green-price"]');
  if (greenPrice) {
    row['#Feed_Price'] = extractPrice(greenPrice);
    row['#Feed_Currency'] = '₽';
  } else {
    // Fallback to generic price selector
    var priceText = getText(element, SEL.marketPrice);
    if (priceText) {
      row['#Feed_Price'] = extractPrice(priceText);
      row['#Feed_Currency'] = '₽';
    }
  }
  // Old price (crossed out)
  var oldPriceText = getText(element, '.EcomFeedPrice-Value:not([data-test-id="green-price"])');
  if (oldPriceText && oldPriceText !== greenPrice) {
    row['#Feed_OldPrice'] = extractPrice(oldPriceText);
  }

  const hasCashback = !!element.querySelector('[class*="cashback"], [class*="plus"]');
  if (hasCashback) {
    row['#Feed_HasCashback'] = 'true';
  }

  return row;
}

function parsePostCard(element: Element, index: number): FeedCardRow {
  const row: FeedCardRow = {
    '#Feed_CardType': 'post',
    '#Feed_CardSize': detectCardSize(element),
    '#Feed_Platform': 'desktop',
    '#Feed_Index': String(index),
  };

  row['#Feed_ImageUrl'] = getImageUrl(element, SEL.cardImage);

  // Detect image ratio from natural dimensions
  var contentImg = element.querySelector(SEL.cardImage) as HTMLImageElement | null;
  if (contentImg && contentImg.tagName !== 'IMG') {
    contentImg = contentImg.querySelector('img') as HTMLImageElement | null;
  }
  if (contentImg && contentImg.naturalWidth && contentImg.naturalHeight) {
    row['#Feed_ImageRatio'] = detectRatio(contentImg.naturalWidth, contentImg.naturalHeight);
  }

  const dots = element.querySelectorAll('[class*="Dot"]');
  if (dots.length > 1) {
    row['#Feed_CarouselCount'] = String(dots.length);
  }

  const sliderImages = element.querySelectorAll('.EcomFeedSlider img');
  if (sliderImages.length > 0) {
    const urls = Array.from(sliderImages)
      .map((img) => (img as HTMLImageElement).src)
      .filter(Boolean);
    if (urls.length > 0) {
      row['#Feed_CarouselImages'] = JSON.stringify(urls);
    }
  }

  row['#Feed_Title'] = getText(element, SEL.cardTitle);

  const priceText = getPriceText(element, SEL.price);
  if (priceText) {
    row['#Feed_Price'] = extractPrice(priceText);
    row['#Feed_Currency'] = '₽';
  }

  const discountText = getText(element, SEL.discount);
  if (discountText) {
    row['#Feed_Discount'] = discountText;
  }

  const moreEl = element.querySelector('[class*="more-count"], [class*="moreCount"]');
  if (moreEl) {
    row['#Feed_MoreCount'] = moreEl.textContent?.trim() || '';
  }

  const sourceEl = element.querySelector(SEL.source);
  if (sourceEl) {
    row['#Feed_SourceName'] =
      getText(element, '.EcomFeedCardSource-Name') || getText(element, SEL.source + ' a');
    row['#Feed_SourceAvatarUrl'] = getImageUrl(
      element,
      '.EcomFeedCardSource-Avatar, ' + SEL.source + ' img',
    );
    var sourceDomain = sourceEl.getAttribute('href') || '';
    if (sourceDomain) {
      var domainMatch = sourceDomain.match(/businesses\/@([^?]+)/);
      if (domainMatch) {
        row['#Feed_SourceDomain'] = domainMatch[1];
      }
    }
  }

  const hasAi = !!element.querySelector('[class*="ai-badge"], [class*="AI"]');
  if (hasAi) {
    row['#Feed_HasAiBadge'] = 'true';
  }

  return row;
}

function parseVideoCard(element: Element, index: number): FeedCardRow {
  const row = parsePostCard(element, index);
  row['#Feed_CardType'] = 'video';
  row['#Feed_HasVideo'] = 'true';

  const hasSound = !!element.querySelector('[class*="soundIcon"]');
  if (hasSound) {
    row['#Feed_HasSound'] = 'true';
  }

  return row;
}

function parseAdvertCard(element: Element, index: number): FeedCardRow {
  const row: FeedCardRow = {
    '#Feed_CardType': 'advert',
    '#Feed_CardSize': detectCardSize(element),
    '#Feed_Platform': 'desktop',
    '#Feed_Index': String(index),
  };

  row['#Feed_ImageUrl'] = getImageUrl(element, SEL.advertImage);

  const sourceText = getText(element, '[class*="card-actions__info"]');
  if (sourceText) {
    const lines = sourceText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    row['#Feed_SourceDomain'] = lines[0] || '';
    row['#Feed_SourceLabel'] = lines.find((l) => l === 'Реклама') || 'Реклама';
    row['#Feed_SourceName'] = lines[0] || '';
  }

  var adDescription = getText(element, '[class*="card-actions__description"]');
  row['#Feed_Description'] = adDescription;
  row['#Feed_Title'] = adDescription; // applicator reads #Feed_Title
  row['#Feed_SourceAvatarUrl'] = getImageUrl(element, '[class*="card-actions__icon"] img');

  const adContent = element.querySelector('[class*="advert-card__content"]');
  if (adContent) {
    const bg = window.getComputedStyle(adContent).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      row['#Feed_AdStyle'] = 'branded';
    }
  }

  return row;
}

// ============================================================================
// MAIN PARSER
// ============================================================================

/**
 * Извлекает все карточки ритм-фида из DOM.
 */
export function extractFeedCards(root: Document | Element = document): FeedCardRow[] {
  const feedContainer = root.querySelector(SEL.feedContainer);
  if (!feedContainer) {
    console.warn('[Contentify Feed] Masonry feed container not found');
    return [];
  }

  const items = feedContainer.querySelectorAll(SEL.feedItem);
  const rows: FeedCardRow[] = [];

  items.forEach((item, index) => {
    const type = detectCardType(item);

    let row: FeedCardRow;
    switch (type) {
      case 'market':
        row = parseMarketCard(item, index);
        break;
      case 'video':
        row = parseVideoCard(item, index);
        break;
      case 'advert':
        row = parseAdvertCard(item, index);
        break;
      case 'post':
      default:
        row = parsePostCard(item, index);
        break;
    }

    rows.push(row);
  });

  console.log(
    `[Contentify Feed] Extracted ${rows.length} cards:`,
    rows.reduce((acc: Record<string, number>, r) => {
      acc[r['#Feed_CardType']] = (acc[r['#Feed_CardType']] || 0) + 1;
      return acc;
    }, {}),
  );

  return rows;
}

/**
 * Detects if the current page is a ya.ru rhythm feed.
 */
export function isFeedPage(): boolean {
  return !!document.querySelector('[class*="masonry-feed--rythm-feed"]');
}
