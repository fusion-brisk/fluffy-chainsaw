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
 * ESnippet: если #OrganicHost пустой, извлекаем домен из #FaviconImage
 */
export async function handleESnippetOrganicHostFromFavicon(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const containerName = (container && 'name' in container) ? String(container.name) : '';
  const isESnippetContainer = containerName === 'ESnippet' || containerName === 'Snippet';
  if (!isESnippetContainer) return;

  const existing = (row['#OrganicHost'] || '').trim();
  if (existing) return;

  const fav = (row['#FaviconImage'] || '').trim();
  if (!fav) return;

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
      return hostname;
    } catch (e) {
      return '';
    }
  }

  const host = hostFromFaviconUrl(fav);
  if (!host) return;

  row['#OrganicHost'] = host;

  // Try to set host visually in Path block
  const pathBlock =
    findFirstNodeByName(container, 'Block / Snippet-staff / Path') ||
    findFirstNodeByName(container, 'Path');
  if (pathBlock) {
    const hostNode = findFirstTextByPredicate(pathBlock, (t) => {
      const s = (t.characters || '').trim();
      if (!s) return false;
      return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s);
    });
    if (hostNode) {
      await safeSetTextNode(hostNode, host);
      Logger.debug(`   🌐 [ESnippet] OrganicHost from favicon applied: "${host}"`);
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

  // Управляем видимостью EReviewsLabel
  const reviewsLabelGroup = findFirstNodeByName(container, 'EReviewsLabel');
  const ratingDisplay = formatRatingOneDecimal(ratingRaw);
  if (reviewsLabelGroup) {
    try {
      (reviewsLabelGroup as SceneNode).visible = !!ratingDisplay;
      Logger.debug(`   ⭐ [ShopInfo-Ugc] EReviewsLabel.visible=${!!ratingDisplay}`);
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

