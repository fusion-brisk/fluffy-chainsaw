/**
 * Обработчики для сниппетов (ESnippet, EOfferItem, OfficialShop, ShopInfo)
 * - handleESnippetOrganicTextFallback — fallback для OrganicText
 * - handleESnippetOrganicHostFromFavicon — fallback для OrganicHost
 * - handleShopInfoUgcAndEReviewsShopText — рейтинг и отзывы магазина
 * - handleOfficialShop — галочка "официальный магазин"
 * - handleEOfferItem — модификаторы карточки EOfferItem
 */

import { Logger } from '../logger';
import { processVariantProperty } from '../property-utils';
import {
  findInstanceByName,
  findTextLayerByName,
  findFirstNodeByName,
  findFirstTextByPredicate,
  findGroupByName,
  safeSetTextNode
} from '../utils/node-search';
import { HandlerContext } from './types';

/**
 * ESnippet: если #OrganicText отсутствует/пустой, подставляем #OrganicTitle в блок OrganicContentItem
 */
export async function handleESnippetOrganicTextFallback(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const containerName = (container && 'name' in container) ? String(container.name) : '';
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
    // ignore
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

  const containerName = (container && 'name' in container) ? String(container.name) : '';
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
          // ignore
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
 */
export async function handleShopInfoUgcAndEReviewsShopText(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;
  
  const ratingRaw = (row['#ShopInfo-Ugc'] || '').trim();
  const reviewsTextRaw = (row['#EReviews_shopText'] || '').trim();
  const ratingDisplay = formatRatingOneDecimal(ratingRaw);
  
  const containerName = (container && 'name' in container) ? String(container.name) : '';
  const hasRating = !!ratingDisplay;
  
  // EShopItem: скрываем EShopItemMeta-UgcLine если нет рейтинга
  if (containerName === 'EShopItem') {
    const ugcLine = findFirstNodeByName(container, 'EShopItemMeta-UgcLine');
    if (ugcLine && 'visible' in ugcLine) {
      try {
        (ugcLine as SceneNode).visible = hasRating;
        Logger.debug(`   ⭐ [EShopItemMeta-UgcLine] visible=${hasRating} (rating=${ratingDisplay || 'empty'})`);
      } catch (e) {
        // ignore
      }
    }
  }

  // Управляем видимостью EReviewsLabel
  const reviewsLabelGroup = findFirstNodeByName(container, 'EReviewsLabel');
  if (reviewsLabelGroup) {
    try {
      (reviewsLabelGroup as SceneNode).visible = hasRating;
      Logger.debug(`   ⭐ [ShopInfo-Ugc] EReviewsLabel.visible=${hasRating}`);
    } catch (e) {
      // ignore
    }
  }

  if (!ratingDisplay && !reviewsTextRaw) return;
  
  // 1) Named targets
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
 * Обработка OfficialShop — показать/скрыть группу "After" внутри EShopName
 */
export function handleOfficialShop(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;

  const isOfficial = row['#OfficialShop'] === 'true';
  
  const shopNameInstance = findInstanceByName(container, 'EShopName');
  
  if (shopNameInstance) {
    const afterGroup = findGroupByName(shopNameInstance, 'After');
    
    if (afterGroup) {
      try {
        afterGroup.visible = isOfficial;
        Logger.debug(`   🏪 [OfficialShop] After.visible=${isOfficial} для "${row['#ShopName']}"`);
      } catch (e) {
        Logger.error(`   ❌ Ошибка установки visible для After в EShopName:`, e);
      }
    } else {
      if ('children' in shopNameInstance) {
        for (const child of shopNameInstance.children) {
          if (child.name === 'After' && !child.removed) {
            try {
              child.visible = isOfficial;
              Logger.debug(`   🏪 [OfficialShop] After.visible=${isOfficial} (${child.type})`);
            } catch (e) {
              Logger.error(`   ❌ Ошибка установки visible для After:`, e);
            }
            break;
          }
        }
      }
    }
  }
}

/**
 * Обработка EOfferItem — модификаторы карточки предложения
 */
export function handleEOfferItem(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;
  
  const snippetType = row['#SnippetType'];
  if (snippetType !== 'EOfferItem') return;
  
  Logger.debug(`   📦 [EOfferItem] Обработка модификаторов для "${row['#ShopName']}"`);
  
  if (container.type === 'INSTANCE' && !container.removed) {
    const instance = container as InstanceNode;
    
    // defaultOffer
    const isDefaultOffer = row['#EOfferItem_defaultOffer'] === 'true';
    processVariantProperty(instance, `defaultOffer=${isDefaultOffer}`, '#EOfferItem_defaultOffer');
    
    // hasButton
    const hasButton = row['#EOfferItem_hasButton'] === 'true' || row['#BUTTON'] === 'true';
    let buttonSet = processVariantProperty(instance, `button=${hasButton}`, '#EOfferItem_hasButton');
    if (!buttonSet) buttonSet = processVariantProperty(instance, `Button=${hasButton}`, '#EOfferItem_hasButton');
    if (!buttonSet) buttonSet = processVariantProperty(instance, `hasButton=${hasButton}`, '#EOfferItem_hasButton');
    
    // hasReviews
    const hasReviews = row['#EOfferItem_hasReviews'] === 'true' || (row['#ReviewsNumber'] && row['#ReviewsNumber'].trim() !== '');
    let reviewsSet = processVariantProperty(instance, `reviews=${hasReviews}`, '#EOfferItem_hasReviews');
    if (!reviewsSet) reviewsSet = processVariantProperty(instance, `Reviews=${hasReviews}`, '#EOfferItem_hasReviews');
    if (!reviewsSet) reviewsSet = processVariantProperty(instance, `hasReviews=${hasReviews}`, '#EOfferItem_hasReviews');
    
    // hasDelivery
    const hasDelivery = row['#EOfferItem_hasDelivery'] === 'true' || (row['#DeliveryList'] && row['#DeliveryList'].trim() !== '');
    let deliverySet = processVariantProperty(instance, `delivery=${hasDelivery}`, '#EOfferItem_hasDelivery');
    if (!deliverySet) deliverySet = processVariantProperty(instance, `Delivery=${hasDelivery}`, '#EOfferItem_hasDelivery');
    if (!deliverySet) deliverySet = processVariantProperty(instance, `hasDelivery=${hasDelivery}`, '#EOfferItem_hasDelivery');
    
    Logger.debug(`   📦 [EOfferItem] Модификаторы: defaultOffer=${isDefaultOffer}, button=${hasButton}, reviews=${hasReviews}, delivery=${hasDelivery}`);
  }
}

/**
 * Обработка ShopOfflineRegion — адрес магазина (#addressText, #addressLink)
 * Скрывает блок Address если данных нет
 */
export async function handleShopOfflineRegion(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const hasShopOfflineRegion = row['#hasShopOfflineRegion'] === 'true';
  const addressText = (row['#addressText'] || '').trim();
  const addressLink = (row['#addressLink'] || '').trim();
  
  // Ищем контейнер Address в разных вариантах именования
  const addressContainerNames = ['Address', 'ShopOfflineRegion', 'AddressBlock', 'Geo'];
  let addressContainer: SceneNode | null = null;
  
  for (const name of addressContainerNames) {
    const found = findFirstNodeByName(container, name);
    if (found && 'visible' in found) {
      addressContainer = found as SceneNode;
      break;
    }
  }
  
  // Если нет данных — скрываем контейнер
  if (!hasShopOfflineRegion || (!addressText && !addressLink)) {
    if (addressContainer && 'visible' in addressContainer) {
      try {
        addressContainer.visible = false;
        Logger.debug(`   📍 [ShopOfflineRegion] Скрыт (нет данных)`);
      } catch (e) { /* ignore */ }
    }
    return;
  }
  
  // Показываем контейнер
  if (addressContainer && 'visible' in addressContainer) {
    try {
      addressContainer.visible = true;
    } catch (e) { /* ignore */ }
  }
  
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

