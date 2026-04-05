/**
 * Text content handlers — filling text layers with data from CSV rows
 *
 * Handles:
 * - OrganicText fallback (ESnippet)
 * - OrganicHost from favicon URL (ESnippet)
 * - Shop rating and reviews text (EReviewsLabel)
 * - OfficialShop badge
 * - QuoteText and author avatar
 * - OrganicPath
 * - ShopOfflineRegion (address)
 */

import { Logger } from '../../logger';
import { trySetProperty } from '../property-utils';
import {
  findTextLayerByName,
  findFirstNodeByName,
  findFirstTextByPredicate,
  safeSetTextNode,
} from '../../utils/node-search';
import { getCachedInstance } from '../../utils/instance-cache';
import { fetchAndApplyImage } from '../image-apply';
import { HandlerContext } from './types';

/**
 * ESnippet: если #OrganicText отсутствует/пустой, подставляем #OrganicTitle в блок OrganicContentItem
 */
export async function handleESnippetOrganicTextFallback(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const containerName = container && 'name' in container ? String(container.name) : '';
  const isESnippetContainer = containerName === 'ESnippet' || containerName === 'Snippet';
  if (!isESnippetContainer) return;

  const organicText = (row['#OrganicText'] || '').trim();
  const organicTitleFromRow = (row['#OrganicTitle'] || '').trim();
  let desired = organicText || organicTitleFromRow;

  // Если по данным ничего нет — читаем фактический OrganicTitle из Figma
  if (!desired) {
    const titleBlock =
      findFirstNodeByName(container, 'Block / Snippet-staff / OrganicTitle') ||
      findFirstNodeByName(container, 'OrganicTitle');
    if (titleBlock) {
      const titleText = findFirstTextByPredicate(titleBlock, () => true);
      if (titleText) {
        desired = (titleText.characters || '').trim();
      }
    }
  }
  if (!desired) return;

  // 1) Если в макете есть именованный слой — используем его
  const named = findTextLayerByName(container, '#OrganicText');
  if (named) {
    await safeSetTextNode(named, desired);
    return;
  }

  // 2) Fallback на известный блок OrganicContentItem
  const contentItem =
    findFirstNodeByName(container, 'Block / Snippet-staff / OrganicContentItem') ||
    findFirstNodeByName(container, 'OrganicContentItem');
  if (!contentItem) return;

  const textNode = findFirstTextByPredicate(contentItem, () => true);
  if (!textNode) return;

  await safeSetTextNode(textNode, desired);
  try {
    textNode.visible = true;
  } catch (e) {
    Logger.debug('[ESnippet] OrganicText visibility toggle failed');
  }
  Logger.debug(`   📝 [ESnippet] OrganicText fallback applied (len=${desired.length})`);
}

/**
 * ESnippet: применяет #OrganicHost к слою Path
 * Если хост пустой — пытается извлечь из #FaviconImage
 */
export async function handleESnippetOrganicHostFromFavicon(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const containerName = container && 'name' in container ? String(container.name) : '';
  const isESnippetContainer = containerName === 'ESnippet' || containerName === 'Snippet';
  if (!isESnippetContainer) return;

  // Функция извлечения хоста из Yandex Favicon URL
  function hostFromFaviconUrl(url: string): string {
    try {
      const s = String(url || '');
      const m = s.match(/\/favicon\/v2\/([^?]+)/);
      if (!m || !m[1]) return '';
      const decoded = decodeURIComponent(m[1]);
      let hostname = decoded;
      if (hostname.indexOf('http') === 0) {
        try {
          hostname = new URL(hostname).hostname;
        } catch (e) {
          Logger.debug('[ESnippet] hostFromFaviconUrl URL parse failed');
        }
      } else {
        hostname = hostname.split('/')[0];
      }
      hostname = String(hostname || '').trim();
      if (!hostname) return '';
      if (hostname.length > 80) hostname = hostname.substring(0, 80);
      return hostname.replace(/^www\./, '');
    } catch (e) {
      return '';
    }
  }

  // Определяем хост: сначала из row, потом fallback из FaviconImage
  let host = (row['#OrganicHost'] || '').trim();

  if (!host) {
    const fav = (row['#FaviconImage'] || '').trim();
    if (fav) {
      host = hostFromFaviconUrl(fav);
      if (host) {
        row['#OrganicHost'] = host;
        Logger.debug(`   🔧 [ESnippet] OrganicHost извлечён из FaviconImage: "${host}"`);
      }
    }
  }

  if (!host) return;

  // Применяем хост к текстовому слою в блоке Path
  const pathBlock =
    findFirstNodeByName(container, 'Block / Snippet-staff / Path') ||
    findFirstNodeByName(container, 'Path');
  if (pathBlock) {
    // Ищем первый текстовый слой с паттерном домена (например "yandex.ru", "example.com")
    const hostNode = findFirstTextByPredicate(pathBlock, (t) => {
      const s = (t.characters || '').trim();
      if (!s) return false;
      // Проверяем что текст похож на домен
      return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s);
    });
    if (hostNode) {
      await safeSetTextNode(hostNode, host);
      Logger.debug(`   🌐 [ESnippet] OrganicHost applied to Path: "${host}"`);
    }
  }
}

/**
 * Форматирование рейтинга до одного знака после запятой
 */
function formatRatingOneDecimal(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  const n = parseFloat(s.replace(',', '.'));
  if (isNaN(n)) return s.replace('.', ',');
  // Guard: рейтинг магазина должен быть 0..5
  if (n < 0 || n > 5) return '';
  return n.toFixed(1).replace('.', ',');
}

/**
 * Заполняет рейтинг магазина и текст отзывов (SERP)
 * Visibility управляется через withReviews на сниппете (EShopItem, EOfferItem, ESnippet)
 */
export async function handleShopInfoUgcAndEReviewsShopText(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const ratingRaw = (row['#ShopInfo-Ugc'] || '').trim();
  const reviewsTextRaw = (row['#EReviews_shopText'] || '').trim();
  const ratingDisplay = formatRatingOneDecimal(ratingRaw);

  // Visibility теперь через withReviews на сниппете — убрано прямое управление visible

  if (!ratingDisplay && !reviewsTextRaw) return;

  const reviewsLabelGroup = findFirstNodeByName(container, 'EReviewsLabel');

  // 0) Set value on Line instances inside EReviewsLabel (new structure: 2 × Line with value property)
  if (reviewsLabelGroup && reviewsLabelGroup.type === 'INSTANCE') {
    const inst = reviewsLabelGroup as InstanceNode;
    if ('findAll' in inst) {
      const lineInstances = inst.findAll(
        (n: SceneNode) => n.type === 'INSTANCE' && n.name === 'Line',
      ) as InstanceNode[];

      let linesSet = 0;
      // First Line = rating, Second Line = reviews text
      if (ratingDisplay && lineInstances.length >= 1) {
        try {
          lineInstances[0].setProperties({ value: ratingDisplay });
          linesSet++;
          Logger.debug(`   ⭐ [EReviewsLabel] Line[0].value set: ${ratingDisplay}`);
        } catch (_e) {
          Logger.debug('[EReviewsLabel] Line[0].value rating set failed');
        }
      }
      if (reviewsTextRaw && lineInstances.length >= 2) {
        try {
          lineInstances[1].setProperties({ value: reviewsTextRaw });
          linesSet++;
          Logger.debug(`   📝 [EReviewsLabel] Line[1].value set: ${reviewsTextRaw}`);
        } catch (_e) {
          Logger.debug('[EReviewsLabel] Line[1].value reviews set failed');
        }
      }
      if (linesSet > 0) return; // Lines set, skip text fallbacks
    }
  }

  // 1) Named targets (legacy fallback)
  if (ratingDisplay) {
    const namedRating = findTextLayerByName(container, '#ShopInfo-Ugc');
    if (namedRating) {
      await safeSetTextNode(namedRating, ratingDisplay);
      Logger.debug(`   ⭐ [ShopInfo-Ugc] Установлен рейтинг: ${ratingDisplay}`);
    }
  }
  if (reviewsTextRaw) {
    const namedReviews = findTextLayerByName(container, '#EReviews_shopText');
    if (namedReviews) {
      await safeSetTextNode(namedReviews, reviewsTextRaw);
      Logger.debug(`   📝 [EReviews_shopText] Установлен текст`);
    }
  }

  // 2) Fallback by known group names
  if (reviewsLabelGroup) {
    if (ratingDisplay) {
      const ratingNode = findFirstTextByPredicate(reviewsLabelGroup, (t) => {
        const s = (t.characters || '').trim();
        return /^[0-5][.,]\d$/.test(s) || /^[0-5]$/.test(s);
      });
      if (ratingNode) {
        await safeSetTextNode(ratingNode, ratingDisplay);
        Logger.debug(`   ⭐ [ShopInfo-Ugc] Fallback: рейтинг в "EReviewsLabel"`);
      }
    }
    if (reviewsTextRaw) {
      const reviewsNode = findFirstTextByPredicate(reviewsLabelGroup, (t) => {
        const s = (t.characters || '').toLowerCase();
        return s.includes('отзыв');
      });
      if (reviewsNode) {
        await safeSetTextNode(reviewsNode, reviewsTextRaw);
        Logger.debug(`   📝 [EReviews_shopText] Fallback: текст в "EReviewsLabel"`);
      }
    }
  }

  // ESnippet: группа "Rating + Reviews"
  const ratingReviewsGroup = findFirstNodeByName(container, 'Rating + Reviews');
  if (ratingReviewsGroup) {
    if (ratingDisplay) {
      const ratingNode = findFirstTextByPredicate(ratingReviewsGroup, (t) => {
        const s = (t.characters || '').trim();
        return /^[0-5][.,]\d$/.test(s) || /^[0-5]$/.test(s);
      });
      if (ratingNode) {
        await safeSetTextNode(ratingNode, ratingDisplay);
        Logger.debug(`   ⭐ [ShopInfo-Ugc] Fallback: рейтинг в "Rating + Reviews"`);
      }
    }
    if (reviewsTextRaw) {
      const reviewsNode = findFirstTextByPredicate(ratingReviewsGroup, (t) => {
        const s = (t.characters || '').toLowerCase();
        return s.includes('отзыв');
      });
      if (reviewsNode) {
        await safeSetTextNode(reviewsNode, reviewsTextRaw);
        Logger.debug(`   📝 [EReviews_shopText] Fallback: текст в "Rating + Reviews"`);
      }
    }
  }
}

/**
 * Обработка OfficialShop — устанавливает isOfficial на EShopName
 * Свойство isOfficial (boolean) управляет показом галочки "Официальный магазин"
 */
export function handleOfficialShop(context: HandlerContext): void {
  const { container, row, instanceCache } = context;
  if (!container || !row) return;

  const isOfficial = row['#OfficialShop'] === 'true';

  const shopNameInstance = getCachedInstance(instanceCache!, 'EShopName');

  if (shopNameInstance) {
    const set = trySetProperty(shopNameInstance, ['isOfficial'], isOfficial, '#OfficialShop');
    Logger.debug(`   🏪 [OfficialShop] isOfficial=${isOfficial}, result=${set}`);
  }
}

/**
 * Обработка #QuoteText — заполнение текстового слоя с цитатой из отзыва
 * Ищет слой #QuoteText, #EQuote-Text или EQuote-Text внутри контейнера
 */
export async function handleQuoteText(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const quoteText = (row['#QuoteText'] || row['#EQuote-Text'] || '').trim();
  const hasQuote = row['#withQuotes'] === 'true' || !!quoteText;

  // Workaround: withQuotes boolean не привязан к слою в touch-варианте ESnippet.
  // Скрываем Line / EQuote вручную когда цитат нет.
  if (!hasQuote) {
    const eQuoteLayer = findFirstNodeByName(container, 'Line / EQuote');
    if (eQuoteLayer && 'visible' in eQuoteLayer) {
      try {
        (eQuoteLayer as SceneNode).visible = false;
        Logger.debug('   💬 [QuoteText] Line / EQuote hidden (no quote data, touch workaround)');
      } catch (_e) {
        Logger.debug('[QuoteText] EQuote hide failed');
      }
    }
    return;
  }

  // Применяем текст цитаты, если он есть
  if (quoteText) {
    let textApplied = false;

    // Strategy 0: Set value on Line instance inside Line / EQuote
    const eQuoteWrapper = findFirstNodeByName(container, 'Line / EQuote');
    if (eQuoteWrapper && eQuoteWrapper.type === 'INSTANCE') {
      // Line / EQuote contains a nested Line instance with value property
      const innerLine = (eQuoteWrapper as InstanceNode).findOne(
        (n: SceneNode) => n.type === 'INSTANCE' && n.name === 'Line',
      ) as InstanceNode | null;
      if (innerLine) {
        try {
          innerLine.setProperties({ value: quoteText });
          textApplied = true;
          Logger.debug(`   💬 [QuoteText] Line.value set: "${quoteText.substring(0, 40)}..."`);
        } catch (_e) {
          Logger.debug('[QuoteText] Line.value set failed');
        }
      }
    }

    // Strategy 1: Named text layers (legacy)
    if (!textApplied) {
      const quoteLayerNames = ['#QuoteText', '#EQuote-Text', 'EQuote-Text', 'Quote'];
      for (const name of quoteLayerNames) {
        const layer = findTextLayerByName(container, name);
        if (layer) {
          await safeSetTextNode(layer, quoteText);
          Logger.debug(`   💬 [QuoteText] Установлена цитата: "${quoteText.substring(0, 40)}..."`);
          textApplied = true;
          break;
        }
      }
    }

    // Strategy 2: Predicate search inside EQuote container
    if (!textApplied) {
      const quoteContainer =
        findFirstNodeByName(container, 'EQuote') ||
        findFirstNodeByName(container, 'OrganicUgcReviews-QuoteWrapper');
      if (quoteContainer) {
        const textNode = findFirstTextByPredicate(quoteContainer, (t) => {
          const s = (t.characters || '').trim();
          return s.includes('«') || s.includes('»') || s.includes('"') || s.length > 10;
        });
        if (textNode) {
          await safeSetTextNode(textNode, quoteText);
          Logger.debug(
            `   💬 [QuoteText] Fallback: цитата через EQuote: "${quoteText.substring(0, 40)}..."`,
          );
        }
      }
    }
  }

  // Применяем аватар автора цитаты
  const avatarUrl = (row['#EQuote-AuthorAvatar'] || row['#QuoteImage'] || '').trim();
  if (avatarUrl) {
    await applyQuoteAuthorAvatar(container, avatarUrl);
  }
}

/**
 * Применяет аватар автора цитаты к слою #EQuote-AuthorAvatar
 */
async function applyQuoteAuthorAvatar(container: BaseNode, avatarUrl: string): Promise<void> {
  if (!('type' in container) || container.type === 'DOCUMENT' || container.type === 'PAGE') {
    return;
  }

  const sceneContainer = container as SceneNode;

  // Ищем слой для аватара
  const layerNames = [
    '#EQuote-AuthorAvatar',
    'EQuote-AuthorAvatar',
    '#QuoteImage',
    'EQuote-AvatarWrapper',
  ];
  let layer: SceneNode | null = null;

  for (const name of layerNames) {
    layer = findFirstNodeByName(sceneContainer, name) as SceneNode | null;
    if (layer && 'fills' in layer) {
      break;
    }
    layer = null;
  }

  if (!layer) {
    // Fallback: ищем внутри EQuote или OrganicUgcReviews-QuoteWrapper
    const quoteWrapper =
      findFirstNodeByName(sceneContainer, 'EQuote') ||
      findFirstNodeByName(sceneContainer, 'OrganicUgcReviews-QuoteWrapper');
    if (quoteWrapper) {
      // Ищем любой небольшой квадратный/круглый слой (аватар обычно маленький)
      const avatarCandidates = ['Avatar', 'Image', 'Photo'];
      for (const name of avatarCandidates) {
        layer = findFirstNodeByName(quoteWrapper, name) as SceneNode | null;
        if (layer && 'fills' in layer) break;
        layer = null;
      }
    }
  }

  if (!layer || !('fills' in layer)) {
    Logger.debug(`   👤 [QuoteAvatar] Слой не найден`);
    return;
  }

  Logger.debug(`   👤 [QuoteAvatar] Найден слой: "${layer.name}"`);
  await fetchAndApplyImage(layer, avatarUrl, 'FILL', '[QuoteAvatar]');
}

/**
 * Обработка #OrganicPath — заполнение текстового слоя с путём (после домена)
 * Например: video-shoper.ru › Xiaomi-15T-Pro-12/51...
 */
export async function handleOrganicPath(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const organicPath = (row['#OrganicPath'] || '').trim();
  if (!organicPath) return;

  // Ищем текстовый слой для пути
  const pathLayerNames = ['#OrganicPath', '#organicPath', 'OrganicPath', 'Path-Suffix'];
  for (const name of pathLayerNames) {
    const layer = findTextLayerByName(container, name);
    if (layer) {
      await safeSetTextNode(layer, organicPath);
      Logger.debug(`   🔗 [OrganicPath] Установлен путь: "${organicPath}"`);
      return;
    }
  }

  // Fallback: ищем текстовый слой внутри Path блока
  const pathBlock =
    findFirstNodeByName(container, 'Block / Snippet-staff / Path') ||
    findFirstNodeByName(container, 'Path');
  if (pathBlock) {
    // Ищем текст после разделителя (не домен)
    const pathTextNode = findFirstTextByPredicate(pathBlock, (t) => {
      const s = (t.characters || '').trim();
      // Это НЕ домен (содержит / или длиннее 30 символов)
      return s.includes('/') || s.length > 30;
    });
    if (pathTextNode) {
      await safeSetTextNode(pathTextNode, organicPath);
      Logger.debug(`   🔗 [OrganicPath] Fallback: путь через Path блок: "${organicPath}"`);
    }
  }
}

/**
 * Обработка ShopOfflineRegion — адрес магазина (#addressText, #addressLink)
 * Visibility управляется через withAddress на сниппете
 */
export async function handleShopOfflineRegion(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const addressText = (row['#addressText'] || '').trim();
  const addressLink = (row['#addressLink'] || '').trim();

  // Visibility теперь через withAddress на сниппете — убрано прямое управление visible

  if (!addressText && !addressLink) return;

  // Применяем #addressText
  if (addressText) {
    const addressTextNode = findTextLayerByName(container, '#addressText');
    if (addressTextNode) {
      await safeSetTextNode(addressTextNode, addressText);
      Logger.debug(`   📍 [ShopOfflineRegion] addressText: "${addressText}"`);
    }
  }

  // Применяем #addressLink
  if (addressLink) {
    const addressLinkNode = findTextLayerByName(container, '#addressLink');
    if (addressLinkNode) {
      await safeSetTextNode(addressLinkNode, addressLink);
      Logger.debug(`   📍 [ShopOfflineRegion] addressLink: "${addressLink}"`);
    }
  }
}
