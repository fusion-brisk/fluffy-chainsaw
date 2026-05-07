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

  // Advert (реклама) — match by class OR by data-id="advert-card" on root.
  // Yandex stamps `data-id="advert-card"` on the LI itself for RTB blocks;
  // the `advert-card--rythm-feed-…` class lives on a child wrapper. The
  // class-only check missed advert cards whose root marker is just the
  // data attribute.
  if (
    element.querySelector(SEL.advertCard) ||
    element.querySelector('[data-id="advert-card"]') ||
    element.getAttribute('data-id') === 'advert-card'
  ) {
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

/**
 * Pull the FIRST URL out of a `srcset="url 1x, url 2x"` attribute.
 * Returns '' on miss.
 */
function firstFromSrcset(srcset: string | null): string {
  if (!srcset) return '';
  // srcset is whitespace-separated URLs with optional descriptors.
  const first = srcset.trim().split(/\s+/)[0];
  return first && first.startsWith('http') ? first : '';
}

/**
 * Resolve an `<img>`'s URL across lazy-load schemes.
 *
 * Yandex feed cards lazy-load via at least three mechanisms (observed in
 * March-April 2026 DOM):
 *   1. `<img src="…">` — eagerly loaded once close to viewport.
 *   2. `<img data-src="…" src="placeholder.svg">` — JS swaps `src` on
 *      IntersectionObserver. Cards offscreen still expose `data-src`.
 *   3. `<img srcset="…">` — DPR-aware variants, no plain `src`.
 *
 * If the card never entered the viewport (e.g. anywhere below the initial
 * fold), `naturalWidth/Height` will be 0 and `src` may be a tiny SVG
 * placeholder. The fallback ladder below covers all three; `getImageUrl`
 * is also resilient to background-image fills.
 */
function imageSrcFromImg(img: HTMLImageElement): string {
  // 1) Real src — but reject obvious placeholders ("data:image/svg+xml;…",
  // "transparent.png", 1x1 pixels). Anything else is a real CDN URL.
  const src = img.src || '';
  if (src && !src.startsWith('data:') && !/transparent|placeholder|spacer/i.test(src)) {
    return src;
  }
  // 2) data-src / data-original / data-lazy — common lazy-load attributes.
  const lazy =
    img.getAttribute('data-src') ||
    img.getAttribute('data-original') ||
    img.getAttribute('data-lazy-src') ||
    '';
  if (lazy && lazy.startsWith('http')) return lazy;
  // 3) srcset — pick the first URL.
  const fromSrcset = firstFromSrcset(img.getAttribute('srcset'));
  if (fromSrcset) return fromSrcset;
  // 4) Last-resort: return whatever src we had (placeholder is better than '').
  return src;
}

/** Достаёт src изображения (из img.src или background-image) */
function getImageUrl(parent: Element, selector: string): string {
  const el = parent.querySelector(selector);
  if (!el) return '';

  // Прямой img
  if (el.tagName === 'IMG') {
    return imageSrcFromImg(el as HTMLImageElement);
  }

  // img внутри контейнера
  const img = el.querySelector('img');
  if (img) return imageSrcFromImg(img);

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
 * Map width/height ratio to closest available Figma `Image` ratio variant.
 *
 * The Figma `Image` component-set in this design system exposes ONLY four
 * portrait/square options (no landscape — feed cards are always taller
 * than wide):
 *   1:1   → 1.000
 *   4:5   → 0.800
 *   3:4   → 0.750
 *   9:16  → 0.5625
 *
 * Boundaries are midpoints between adjacent ratios:
 *   ≥ 0.900  → 1:1
 *   ≥ 0.775  → 4:5
 *   ≥ 0.656  → 3:4
 *   <  0.656 → 9:16
 *
 * Anything wider than 1:1 (landscape) clamps to 1:1 — closest available.
 *
 * Real ya.ru tiers:
 *   span 14 (290:446 ≈ 0.650) → 9:16 (closer to 0.5625 than 0.75)
 *   span 17 (290:542 ≈ 0.535) → 9:16
 *   span 11 (≈ 0.83 hypothetical) → 4:5
 */
function ratioFromAspect(r: number): string {
  if (!Number.isFinite(r) || r <= 0) return '3:4'; // safe default for missing data
  if (r >= 0.9) return '1:1';
  if (r >= 0.775) return '4:5';
  if (r >= 0.656) return '3:4';
  return '9:16';
}

/**
 * Map image natural dimensions to closest standard Figma ratio value.
 * Used as fallback when grid-row span isn't available.
 */
function detectRatio(width: number, height: number): string {
  if (!width || !height) return '3:4';
  return ratioFromAspect(width / height);
}

/**
 * Read the masonry grid-row span the card occupies on ya.ru. The feed is a
 * CSS Grid where every card declares `grid-row: span N` based on its tier
 * modifier (`item-size_s` → smaller span, `_xl` → larger). We observed:
 *   m  → span 14  (≈ 290:446 ≈ 5:8 ≈ 0.65)
 *   ml → span 17  (≈ 290:542 ≈ 9:17 ≈ 0.535)
 * Step between adjacent tiers is ~3 rows. Span × column-width gives the
 * card's true aspect ratio without depending on lazy-loaded images.
 *
 * Returns 0 when not in a grid (e.g. detached node in a unit test) so the
 * caller can fall back to the natural-dimension heuristic.
 */
function gridRowSpan(element: Element): number {
  try {
    const cs = window.getComputedStyle(element as HTMLElement);
    // Modern browsers report `grid-row: span N`; the `gridRow` shorthand
    // resolves to `gridRowStart` (`span N`) + `gridRowEnd` (`auto`).
    const start = cs.gridRowStart || '';
    const m = start.match(/span (\d+)/);
    if (m) return parseInt(m[1], 10) || 0;
    const both = cs.gridRow || '';
    const m2 = both.match(/span (\d+)/);
    return m2 ? parseInt(m2[1], 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Approximate height of the Card Source row (avatar + name) at the bottom of
 * every Feed Card on live ya.ru, in CSS pixels. Used to subtract the row's
 * contribution from the total card height before computing the IMAGE aspect
 * ratio — Figma's `Ratio` variant on the Image instance is the IMAGE aspect,
 * not the full-card aspect, so mapping based on the latter sometimes picked
 * the wrong neighbour (e.g. xs-tier 386px ≈ image 4:5 but card-aspect math
 * mapped to 3:4).
 */
const CARD_SOURCE_ROW_PX = 52;

/**
 * Compute the closest Figma image-ratio variant from the masonry grid-row
 * span. The card occupies a column of `colWidthPx` and `span` rows of
 * `rowHeightPx` (≈ 31.86 on desktop ya.ru). Subtract the Card Source row
 * before deriving aspect so we map the IMAGE area, not the full card.
 */
function ratioFromSpan(span: number, colWidthPx: number, rowHeightPx: number): string {
  if (!span || !colWidthPx || !rowHeightPx) return '';
  const cardHeight = span * rowHeightPx;
  const imageHeight = cardHeight - CARD_SOURCE_ROW_PX;
  if (imageHeight <= 0) return '';
  return ratioFromAspect(colWidthPx / imageHeight);
}

/**
 * Estimate the row height of the masonry feed from its `<ul>`'s
 * `gridTemplateRows`. Yandex sets `grid-auto-rows: auto`, so the actual
 * row height is whatever the grid resolved to (≈ 31.86 on desktop,
 * different on touch). Returning 0 means we couldn't measure it; caller
 * should fall back to natural-dim ratio detection.
 */
function feedRowHeightPx(feedContainer: Element): number {
  try {
    const cs = window.getComputedStyle(feedContainer as HTMLElement);
    // gridTemplateRows looks like "31.8594px 31.8594px ..." — first token is enough.
    const tokens = (cs.gridTemplateRows || '').trim().split(/\s+/);
    for (const t of tokens) {
      const px = parseFloat(t);
      if (Number.isFinite(px) && px > 1) return px;
    }
    return 0;
  } catch {
    return 0;
  }
}

// ============================================================================
// CARD PARSERS
// ============================================================================

interface GridCtx {
  rowHeightPx: number;
  colWidthPx: number;
}

/**
 * Stamp ratio + raw span on a row using the grid signal first, falling
 * back to the image's natural dimensions when grid is unavailable
 * (e.g. headless tests or detached nodes).
 */
function applyRatio(
  row: FeedCardRow,
  element: Element,
  imgW: number,
  imgH: number,
  ctx: GridCtx,
): void {
  const span = gridRowSpan(element);
  if (span) row['#Feed_GridRowSpan'] = String(span);
  if (span && ctx.colWidthPx && ctx.rowHeightPx) {
    row['#Feed_ImageRatio'] = ratioFromSpan(span, ctx.colWidthPx, ctx.rowHeightPx);
    return;
  }
  if (imgW && imgH) {
    row['#Feed_ImageRatio'] = detectRatio(imgW, imgH);
  }
}

function parseMarketCard(element: Element, index: number, ctx: GridCtx): FeedCardRow {
  const row: FeedCardRow = {
    '#Feed_CardType': 'market',
    '#Feed_CardSize': detectCardSize(element),
    '#Feed_Platform': 'desktop',
    '#Feed_Index': String(index),
  };

  row['#Feed_ImageUrl'] = getImageUrl(element, SEL.marketImage);

  // Image ratio — prefer grid-row span (always correct, even when image is
  // lazy-loaded), fall back to natural dimensions of the actual <img>.
  var marketImg = element.querySelector('.EcomFeedMarketCard img') as HTMLImageElement | null;
  applyRatio(
    row,
    element,
    marketImg ? marketImg.naturalWidth || marketImg.clientWidth : 0,
    marketImg ? marketImg.naturalHeight || marketImg.clientHeight : 0,
    ctx,
  );

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

  // Style modifiers — useful for designer to render the right component
  // variant ("redesign" cards have a different shadow/radius treatment;
  // multi-line titles wrap to 2 lines while one-line titles ellipsize).
  const marketRoot = element.querySelector('.EcomFeedMarketCard');
  if (marketRoot) {
    const cls = (marketRoot.className || '').toString();
    if (cls.includes('EcomFeedMarketCard_redesign')) {
      row['#Feed_MarketCardRedesign'] = 'true';
    }
    const titleEl = marketRoot.querySelector('[class*="EcomFeedMarketCard-Title"]');
    if (titleEl) {
      const titleCls = (titleEl.className || '').toString();
      if (titleCls.includes('EcomFeedMarketCard-Title_one-line')) {
        row['#Feed_TitleLineMode'] = 'one-line';
      } else if (titleCls.includes('EcomFeedMarketCard-Title_multi-line')) {
        row['#Feed_TitleLineMode'] = 'multi-line';
      }
    }
  }

  // Stable post id for trackback / dedupe (same field as posts; YA stamps
  // `data-test-post-id` on every card type).
  const postId = element.getAttribute('data-test-post-id');
  if (postId) row['#Feed_PostId'] = postId;

  return row;
}

function parsePostCard(element: Element, index: number, ctx: GridCtx): FeedCardRow {
  const row: FeedCardRow = {
    '#Feed_CardType': 'post',
    '#Feed_CardSize': detectCardSize(element),
    '#Feed_Platform': 'desktop',
    '#Feed_Index': String(index),
  };

  row['#Feed_ImageUrl'] = getImageUrl(element, SEL.cardImage);

  // Image ratio — prefer grid-row span (always correct, even when image is
  // lazy-loaded), fall back to natural dimensions of the actual <img>.
  var contentImg = element.querySelector(SEL.cardImage) as HTMLImageElement | null;
  if (contentImg && contentImg.tagName !== 'IMG') {
    contentImg = contentImg.querySelector('img') as HTMLImageElement | null;
  }
  applyRatio(
    row,
    element,
    contentImg ? contentImg.naturalWidth || contentImg.clientWidth : 0,
    contentImg ? contentImg.naturalHeight || contentImg.clientHeight : 0,
    ctx,
  );

  const dots = element.querySelectorAll('[class*="Dot"]');
  if (dots.length > 1) {
    row['#Feed_CarouselCount'] = String(dots.length);
    // Active slide index — for carousel position tracking
    const activeIdx = Array.from(dots).findIndex((d) =>
      (d.className || '').toString().includes('Dot_active'),
    );
    if (activeIdx >= 0) row['#Feed_ActiveSlideIndex'] = String(activeIdx);
  }

  // Carousel images — search broadly. The .EcomFeedSlider element only contains
  // pagination dots in the current DOM; actual slide images live in
  // card-content__image, EcomFeedSliderItem, and post-products-preview blocks.
  // Dedupe by src to avoid double-counting the same image rendered at multiple
  // resolutions.
  const sliderImageEls = element.querySelectorAll(
    '[class*="card-content__image"] img, ' +
      '[class*="EcomFeedSliderItem"] img, ' +
      '[class*="post-products-preview"] img, ' +
      '.EcomFeedSlider img',
  );
  if (sliderImageEls.length > 0) {
    const seen = new Set<string>();
    const urls: string[] = [];
    sliderImageEls.forEach((img) => {
      const u = imageSrcFromImg(img as HTMLImageElement);
      if (u && !seen.has(u)) {
        seen.add(u);
        urls.push(u);
      }
    });
    if (urls.length > 0) row['#Feed_CarouselImages'] = JSON.stringify(urls);
  }

  // Title resolution — tier fallback. ecom_slider posts have an empty
  // card-actions__description (the visible "description" is the FIRST product
  // in the slider), so we'd otherwise display product names where post titles
  // belong. Pull from A11yHidden first — it's stable and carries the post type
  // prefix ("Галерея: skdesign.ru", "Видео: Счастье в дом ❤️").
  const a11yTitleEl = element.querySelector(
    '[class*="card-content__container"] > h3.visually-hidden a, ' +
      '[class*="card-content__container"] h3.visually-hidden a',
  );
  const a11yTitle = a11yTitleEl?.textContent?.trim() || '';
  if (a11yTitle) {
    row['#Feed_Title'] = a11yTitle;
    // Split prefix vs author for downstream consumers that want them separate.
    const colonIdx = a11yTitle.indexOf(':');
    if (colonIdx > 0 && colonIdx < 30) {
      row['#Feed_TitlePrefix'] = a11yTitle.slice(0, colonIdx).trim();
      row['#Feed_AuthorFromTitle'] = a11yTitle.slice(colonIdx + 1).trim();
    }
  } else {
    row['#Feed_Title'] = getText(element, SEL.cardTitle);
  }

  // "Содержит ссылки на товары" — affiliate-product label. Always sits between
  // the H3 and the full-text P inside the A11y stack.
  const a11yLabels = element.querySelectorAll(
    '[class*="card-content__container"] > p.visually-hidden, ' +
      '[class*="card-content__container"] p.visually-hidden',
  );
  a11yLabels.forEach((p, i) => {
    const t = p.textContent?.trim() || '';
    if (!t) return;
    if (i === 0 && /Содержит ссылки на товары/i.test(t)) {
      row['#Feed_HasProductLinks'] = 'true';
    } else if (t.length > 10) {
      // Longest A11y paragraph is the full post body — useful for layout that
      // shows a longer caption than the visible description allows.
      row['#Feed_DescriptionFull'] = t;
    }
  });

  // Preview-product title — keep separately so plugin can render the product
  // strip under the post (slider) without overwriting the post title.
  const previewTitleEl = element.querySelector(
    '[class*="post-products-preview__title--rythm-feed"]',
  );
  const previewTitle = previewTitleEl?.textContent?.trim() || '';
  if (previewTitle) row['#Feed_PreviewProductTitle'] = previewTitle;

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
      // Match both /rythm/businesses/@slug (commercial accounts) and
      // /rythm/profile/@slug (personal channels). Original regex only
      // covered businesses, so all profile/@... cards lost their source
      // domain.
      var domainMatch = sourceDomain.match(/(?:businesses|profile)\/@([^?]+)/);
      if (domainMatch) {
        var slug = domainMatch[1];
        // Skip Yandex's internal hex-hash slugs (32 hex chars w/o a `.`),
        // shown for personal /profile/@<hash> channels — the hash is not a
        // real domain and clutters the Subtitle row in Figma. Real readable
        // slugs like `bentsony.mebel` or `tictactoy` flow through.
        var isHexHash = /^[0-9a-f]{16,}$/i.test(slug);
        if (!isHexHash) {
          row['#Feed_SourceDomain'] = slug;
        }
      }
    }
  }

  // AI badge — class-token match (was substring `[class*="AI"]` which
  // false-positives on `Aria`, `Activate`, etc.). Use explicit token names.
  const hasAi = !!element.querySelector(
    '[class*="ai-badge"], [class*="AiBadge"], [class*="ai_badge"]',
  );
  if (hasAi) {
    row['#Feed_HasAiBadge'] = 'true';
  }

  // Footer action buttons — flag for designer-side decisions about
  // whether to render them on the Figma component.
  if (element.querySelector('[class*="rythm-card__subscribe"]')) {
    row['#Feed_HasSubscribeBtn'] = 'true';
  }
  if (element.querySelector('.post-menu, [class*="rythm-card__more"]')) {
    row['#Feed_HasMoreMenu'] = 'true';
  }

  // Quick-purchase tooltip / header badge (overlay markers on the post image).
  if (
    element.querySelector('[class*="card-content__checkout-badge--rythm-feed"], .ECheckoutTooltip')
  ) {
    row['#Feed_HasCheckoutBadge'] = 'true';
  }
  const headerBadge = element.querySelector('[class*="card-actions__badge--rythm-feed"]');
  if (headerBadge) {
    const t = headerBadge.textContent?.trim();
    row['#Feed_HasHeaderBadge'] = 'true';
    if (t) row['#Feed_HeaderBadgeText'] = t;
  }

  // Stable post id for trackback / dedupe.
  const postId = element.getAttribute('data-test-post-id');
  if (postId) row['#Feed_PostId'] = postId;

  return row;
}

function parseVideoCard(element: Element, index: number, ctx: GridCtx): FeedCardRow {
  const row = parsePostCard(element, index, ctx);
  row['#Feed_CardType'] = 'video';
  row['#Feed_HasVideo'] = 'true';

  const hasSound = !!element.querySelector('[class*="soundIcon"]');
  if (hasSound) {
    row['#Feed_HasSound'] = 'true';
  }

  // For video cards, the `card-content__image` is actually a poster frame.
  // Expose it separately so the plugin's video component can render the
  // play-button overlay over a dedicated poster fill, and so the generic
  // `#Feed_ImageUrl` still points at the same asset for layout-time math.
  if (row['#Feed_ImageUrl']) {
    row['#Feed_VideoPosterUrl'] = row['#Feed_ImageUrl'];
  }
  // Duration label — the live DOM observed didn't expose one yet, but
  // future-proof: look for any time-formatted text near the sound button.
  const durEl = element.querySelector(
    '[class*="card-content__duration"], [class*="VideoSnippet-Duration"] .Label-Content',
  );
  const dur = durEl?.textContent?.trim();
  if (dur && /^\d{1,2}:\d{2}$/.test(dur)) row['#Feed_VideoDuration'] = dur;

  return row;
}

interface ChromeDomApi {
  openOrClosedShadowRoot?: (el: Element) => ShadowRoot | null;
}

/**
 * The advert creative lives inside a closed shadow root attached to a
 * `csr-uniq*` div. Two delivery paths exist:
 *
 * 1. Declarative shadow root parsed from the HTML stream — the `<template
 *    shadowrootmode="closed">` is consumed during parse and the shadow is
 *    attached to its parent. Light DOM then has NO `<template>` element;
 *    contents are reachable only via `chrome.dom.openOrClosedShadowRoot`.
 *
 * 2. RTB late-injected creative — Yandex's iframe loader writes the same
 *    `<template shadowrootmode="closed">` markup via `innerHTML` AFTER the
 *    initial parse. Programmatic HTML injection does NOT process declarative
 *    shadow roots, so the `<template>` remains a normal element in the DOM
 *    and its content is available via `template.content`. The parent has
 *    no real shadow root; chrome.dom returns null.
 *
 * We try path 1 first, fall through to path 2.
 */
type ShadowOrFragment = ShadowRoot | DocumentFragment;

function getAdvertShadowRoot(element: Element): ShadowOrFragment | null {
  const dom = (chrome as unknown as { dom?: ChromeDomApi }).dom;

  // Path 1: real shadow root via chrome.dom
  if (dom && typeof dom.openOrClosedShadowRoot === 'function') {
    const candidates = element.querySelectorAll('[class*="csr-uniq"]');
    for (let i = 0; i < candidates.length; i++) {
      try {
        const root = dom.openOrClosedShadowRoot(candidates[i]);
        if (root) return root;
      } catch {
        // continue
      }
    }
    try {
      const root = dom.openOrClosedShadowRoot(element);
      if (root) return root;
    } catch {
      // continue
    }
  }

  // Path 2: late-injected declarative shadow root remains as a <template>.
  // Pick the first template that carries shadowrootmode (any value).
  const templates = element.querySelectorAll('template');
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i] as HTMLTemplateElement;
    const mode = t.getAttribute('shadowrootmode');
    if (mode && t.content) return t.content;
  }
  // Last-ditch: any <template> with content (Yandex sometimes drops the
  // attribute when the creative is fully built).
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i] as HTMLTemplateElement;
    if (t.content && t.content.childNodes.length > 0) return t.content;
  }
  return null;
}

function extractCssUrl(value: string): string {
  if (!value) return '';
  const decoded = value.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const m = decoded.match(/url\(\s*["']?([^"')]+?)["']?\s*\)/);
  return m ? m[1] : '';
}

function parseAdvertShadowDom(shadow: ShadowOrFragment, row: FeedCardRow): boolean {
  let touched = false;

  const imgEl = shadow.querySelector('[class*="img-source-component"]');
  if (imgEl) {
    const styleAttr = (imgEl as HTMLElement).getAttribute('style') || '';
    const url = extractCssUrl(styleAttr);
    if (url) {
      row['#Feed_ImageUrl'] = url;
      touched = true;
    }
  }
  if (!row['#Feed_ImageUrl']) {
    const styleBlocks = shadow.querySelectorAll('style');
    let bestUrl = '';
    let bestSize = 0;
    for (let i = 0; i < styleBlocks.length; i++) {
      const cssText = styleBlocks[i].textContent || '';
      const re = /url\(\s*([^)\s]+\/wx(\d+))/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(cssText)) !== null) {
        const size = parseInt(m[2], 10) || 0;
        if (size > bestSize) {
          bestSize = size;
          bestUrl = m[1].replace(/^["']|["']$/g, '');
        }
      }
    }
    if (bestUrl) {
      row['#Feed_ImageUrl'] = bestUrl;
      touched = true;
    }
  }

  const logoEl = shadow.querySelector('.ya-unit-logo');
  if (logoEl) {
    const dataUrl = logoEl.getAttribute('data-url') || '';
    let favicon = dataUrl;
    if (!favicon) {
      favicon = extractCssUrl(logoEl.getAttribute('style') || '');
    }
    if (favicon) {
      row['#Feed_SourceAvatarUrl'] = favicon;
      touched = true;
    }
  }

  const domainEl = shadow.querySelector('.ya-unit-domain');
  if (domainEl) {
    const text = (domainEl.textContent || '').trim();
    if (text) {
      // SourceName carries the display value; leave SourceDomain empty so the
      // plugin's Subtitle row collapses (otherwise Subtitle just echoes the
      // title — `divansp.ru / divansp.ru`).
      row['#Feed_SourceName'] = text;
      touched = true;
    }
  }

  const titleEl = shadow.querySelector('.ya-unit-title');
  if (titleEl) {
    const raw = (titleEl.textContent || '').replace(/\s+/g, ' ').trim();
    if (raw) {
      // ya-unit-title в адах часто имеет вид
      //   "Дизайнерский диван CREATICA MONS, синий. 68 300 ₽"
      // Тянем хвостовую цену в `#Feed_Price` и ставим в `#Feed_Title` чистое
      // описание без неё, чтобы Tile / Ads Bottom не дублировал price в
      // Description. Currency-знаки: ₽ / р. / руб.
      const priceMatch = raw.match(/(\d{1,3}(?:[\s  ]\d{3})+|\d{3,})\s*(?:₽|руб\.?|р\.)/i);
      if (priceMatch) {
        row['#Feed_Price'] = priceMatch[1].replace(/[  ]/g, ' ');
        const stripped = raw
          .replace(/[\s.,—–-]*\d{1,3}(?:[\s  ]\d{3})+\s*(?:₽|руб\.?|р\.)\s*$/i, '')
          .trim();
        row['#Feed_Title'] = stripped || raw;
        row['#Feed_Description'] = row['#Feed_Title'];
      } else {
        row['#Feed_Title'] = raw;
        row['#Feed_Description'] = raw;
      }
      touched = true;
    }
  }

  row['#Feed_SourceLabel'] = 'Реклама';
  return touched;
}

function parseAdvertCard(element: Element, index: number, ctx: GridCtx): FeedCardRow {
  const row: FeedCardRow = {
    '#Feed_CardType': 'advert',
    '#Feed_CardSize': detectCardSize(element),
    '#Feed_Platform': 'desktop',
    '#Feed_Index': String(index),
  };

  row['#Feed_ImageUrl'] = getImageUrl(element, SEL.advertImage);

  // Diagnostic: trace shadow availability per advert so the user can tell
  // whether failures are "Yandex RTB hasn't fired" vs "our extractor missed".
  const csr = element.querySelector('[class*="csr-uniq"]') as Element | null;
  const csrInnerLen = csr ? csr.innerHTML.length : -1;
  const shadow = getAdvertShadowRoot(element);
  if (shadow) {
    parseAdvertShadowDom(shadow, row);
  }
  // Single-line trace per advert
  console.log(
    '[advert-parse] idx=' +
      index +
      ' csr=' +
      (csr ? 'yes' : 'no') +
      ' csrInnerLen=' +
      csrInnerLen +
      ' shadow=' +
      (shadow ? 'yes' : 'no') +
      ' imageUrl=' +
      (row['#Feed_ImageUrl'] ? row['#Feed_ImageUrl'].substring(0, 80) : 'EMPTY') +
      ' source=' +
      (row['#Feed_SourceName'] || 'EMPTY'),
  );

  // (No screenshot-clip fallback — when shadow root + DOM extraction both
  // come up empty, the card ships without an image URL and the plugin
  // renders the default Tile / Ads placeholder. Earlier versions captured
  // a page-rect here so background could clip from the full-page screenshot;
  // the resulting JPEG crops baked in UI overlays so we walked it back.)

  applyRatio(row, element, 0, 0, ctx);

  if (!row['#Feed_SourceName']) {
    const sourceText = getText(element, '[class*="card-actions__info"]');
    if (sourceText) {
      const lines = sourceText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      // Same single value populates SourceName only — keeping SourceDomain
      // empty lets the plugin collapse the duplicate Subtitle row.
      row['#Feed_SourceName'] = lines[0] || '';
      row['#Feed_SourceLabel'] = lines.find((l) => l === 'Реклама') || 'Реклама';
    }
  }

  if (!row['#Feed_Title']) {
    const adDescription = getText(element, '[class*="card-actions__description"]');
    row['#Feed_Description'] = adDescription;
    row['#Feed_Title'] = adDescription;
  }
  if (!row['#Feed_SourceAvatarUrl']) {
    row['#Feed_SourceAvatarUrl'] = getImageUrl(element, '[class*="card-actions__icon"] img');
  }

  // Final source-name fallback: derive the advertiser's domain from the
  // favicon URL (`https://favicon.yandex.net/favicon/<domain>?...`). This
  // covers RTB ads where neither shadow root nor card-actions__info had a
  // domain text but the favicon URL did make it through.
  if (!row['#Feed_SourceName'] && row['#Feed_SourceAvatarUrl']) {
    const m = row['#Feed_SourceAvatarUrl'].match(/\/favicon\/([^/?#]+)/);
    if (m && m[1]) {
      row['#Feed_SourceName'] = m[1];
    }
  }

  const adContent = element.querySelector('[class*="advert-card__content"]');
  if (adContent) {
    const bg = window.getComputedStyle(adContent).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      row['#Feed_AdStyle'] = 'branded';
    }
  }

  const postId = element.getAttribute('data-test-post-id');
  if (postId) row['#Feed_PostId'] = postId;

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

  // Measure grid context once — Yandex's masonry uses CSS Grid where each
  // card declares `grid-row: span N` based on its tier (s/m/ml/l/xl). The
  // row height (≈ 31.86 px on desktop) and column width come from the
  // resolved grid template. This lets us derive the card's true aspect
  // ratio without depending on the lazy-loaded <img>'s natural dims.
  const firstItem = items[0] as HTMLElement | undefined;
  const ctx: GridCtx = {
    rowHeightPx: feedRowHeightPx(feedContainer),
    colWidthPx: firstItem ? firstItem.getBoundingClientRect().width || 0 : 0,
  };

  // Source-column derivation. Yandex's masonry uses CSS Grid auto-flow with
  // grid-row span — the visible column for each card is determined by the
  // browser, not the parser. To make the plugin reproduce the same column
  // assignment (instead of running its own greedy shortest-column heuristic
  // that diverges from source), we derive each card's column index from its
  // page-x coordinate relative to the feed container.
  const containerRect = feedContainer.getBoundingClientRect();
  const containerStyle = window.getComputedStyle(feedContainer);
  const gridTemplate = containerStyle.gridTemplateColumns || '';
  const tokens = gridTemplate.trim().split(/\s+/).filter(Boolean);
  const declaredCols = tokens.length;
  const inferredColWidth =
    declaredCols > 0 && containerRect.width > 0
      ? containerRect.width / declaredCols
      : ctx.colWidthPx || 293;

  items.forEach((item, index) => {
    const type = detectCardType(item);

    let row: FeedCardRow;
    switch (type) {
      case 'market':
        row = parseMarketCard(item, index, ctx);
        break;
      case 'video':
        row = parseVideoCard(item, index, ctx);
        break;
      case 'advert':
        row = parseAdvertCard(item, index, ctx);
        break;
      case 'post':
      default:
        row = parsePostCard(item, index, ctx);
        break;
    }

    // Source layout fields — let the plugin mirror live ya.ru column binning.
    if (inferredColWidth > 0) {
      const r = item.getBoundingClientRect();
      const offsetX = r.left - containerRect.left;
      const colIdx = Math.max(0, Math.round(offsetX / inferredColWidth));
      row['#Feed_SourceCol'] = String(colIdx + 1);
    }
    row['#Feed_SourceOrder'] = String(index);

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
