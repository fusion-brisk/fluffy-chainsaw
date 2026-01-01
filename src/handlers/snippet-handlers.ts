/**
 * Обработчики для сниппетов (ESnippet, EOfferItem, OfficialShop, ShopInfo)
 * - handleESnippetOrganicTextFallback — fallback для OrganicText
 * - handleESnippetOrganicHostFromFavicon — fallback для OrganicHost
 * - handleShopInfoUgcAndEReviewsShopText — рейтинг и отзывы магазина
 * - handleOfficialShop — галочка "официальный магазин"
 * - handleEOfferItem — модификаторы карточки EOfferItem
 */

import { Logger } from '../logger';
import { trySetProperty, boolToFigma } from '../property-utils';
import {
  findTextLayerByName,
  findFirstNodeByName,
  findFirstTextByPredicate,
  safeSetTextNode
} from '../utils/node-search';
import { getCachedInstance } from '../utils/instance-cache';
import { HandlerContext } from './types';
import { CSVRow } from '../types/csv-fields';

// Кэш компонентов страницы (построается один раз при первом вызове)
let componentsCache: Map<string, ComponentNode> | null = null;
let componentsCachePageId: string | null = null;

/**
 * Получить компонент по имени из кэша (O(1) вместо findAll)
 */
function getCachedComponent(name: string): ComponentNode | undefined {
  // Проверяем актуальность кэша (страница не изменилась)
  if (componentsCachePageId !== figma.currentPage.id) {
    componentsCache = null;
    componentsCachePageId = null;
  }
  
  // Лениво строим кэш при первом обращении
  if (!componentsCache) {
    const startTime = Date.now();
    componentsCache = new Map();
    componentsCachePageId = figma.currentPage.id;
    
    const allComponents = figma.currentPage.findAll(n => n.type === 'COMPONENT') as ComponentNode[];
    for (const comp of allComponents) {
      if (!comp.removed && !componentsCache.has(comp.name)) {
        componentsCache.set(comp.name, comp);
      }
    }
    
    Logger.debug(`📦 [ComponentsCache] Построен: ${componentsCache.size} компонентов за ${Date.now() - startTime}ms`);
  }
  
  return componentsCache.get(name);
}

/**
 * Очистка кэша компонентов (вызывается при необходимости)
 */
export function clearComponentsCache(): void {
  componentsCache = null;
  componentsCachePageId = null;
}

/**
 * Рекурсивно ищет слой по имени во всех вложенных nodes (включая instances)
 */
function findLayerDeep(node: SceneNode, name: string): SceneNode | null {
  if (node.name === name) return node;
  
  if ('children' in node) {
    for (const child of (node as FrameNode | GroupNode).children) {
      const found = findLayerDeep(child, name);
      if (found) return found;
    }
  }
  
  return null;
}

/**
 * Применяет одиночное изображение к слою #OrganicImage / #ThumbImage / Image Ratio
 * Вызывается для State=Default (одна картинка)
 */
async function applySingleImage(container: SceneNode, row: CSVRow): Promise<void> {
  const url = row['#OrganicImage'] || row['#ThumbImage'] || '';
  
  if (!url || url.trim() === '') {
    Logger.debug(`⚠️ [applySingleImage] URL пустой, пропуск`);
    return;
  }
  
  // Ищем слой изображения по разным именам
  const layerNames = ['#OrganicImage', '#ThumbImage', 'Image Ratio', 'EThumb-Image', '#Image'];
  let layer: SceneNode | null = null;
  
  for (const name of layerNames) {
    layer = findLayerDeep(container, name);
    if (layer) {
      Logger.debug(`🖼️ [applySingleImage] Найден слой "${name}"`);
      break;
    }
  }
  
  if (!layer) {
    Logger.debug(`⚠️ [applySingleImage] Слой изображения не найден (пробовал: ${layerNames.join(', ')})`);
    return;
  }
  
  Logger.debug(`🖼️ [applySingleImage] Применяем к "${layer.name}", URL="${url.substring(0, 50)}..."`);
  
  try {
    let normalizedUrl = url;
    if (url.startsWith('//')) {
      normalizedUrl = `https:${url}`;
    }
    
    // Валидация URL
    try {
      const urlObj = new URL(normalizedUrl);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        Logger.debug(`⚠️ [applySingleImage] Неподдерживаемый протокол: ${urlObj.protocol}`);
        return;
      }
    } catch (urlErr) {
      Logger.debug(`⚠️ [applySingleImage] Невалидный URL: ${normalizedUrl}`);
      return;
    }
    
    const response = await fetch(normalizedUrl);
    if (!response.ok) {
      Logger.debug(`❌ [applySingleImage] Ошибка загрузки: ${response.status}`);
      return;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const imageHash = figma.createImage(uint8Array).hash;
    
    if ('fills' in layer) {
      const imagePaint: ImagePaint = {
        type: 'IMAGE',
        scaleMode: 'FIT',
        imageHash: imageHash
      };
      (layer as GeometryMixin).fills = [imagePaint];
      Logger.debug(`✅ [applySingleImage] Изображение применено`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger.debug(`❌ [applySingleImage] Ошибка: ${msg}`);
  }
}

/**
 * Применяет изображения к слоям #Image1, #Image2, #Image3 внутри EThumbGroup
 * Вызывается ПОСЛЕ переключения imageType на EThumbGroup
 * 
 * FALLBACK: если #Image1 пустой но есть #OrganicImage — используем его
 */
async function applyThumbGroupImages(container: SceneNode, row: CSVRow): Promise<void> {
  // FALLBACK: Если #Image1 пустой, используем #OrganicImage
  const image1 = row['#Image1'] || row['#OrganicImage'] || row['#ThumbImage'] || '';
  const image2 = row['#Image2'] || '';
  const image3 = row['#Image3'] || '';
  
  const imageUrls: Record<string, string> = {
    '#Image1': image1,
    '#Image2': image2,
    '#Image3': image3
  };
  
  Logger.debug(`🖼️ [applyThumbGroupImages] Начало для "${container.name}", URL: Image1="${image1}", Image2="${image2}", Image3="${image3}"`);
  
  // Параллельная загрузка изображений для ускорения
  const loadPromises = Object.entries(imageUrls).map(async ([fieldName, url]) => {
    if (!url || url.trim() === '') {
      Logger.debug(`⚠️ [applyThumbGroupImages] ${fieldName} — URL пустой, пропуск`);
      return;
    }
    
    // Рекурсивный поиск во вложенных instances
    const layer = findLayerDeep(container, fieldName);
    
    if (!layer) {
      Logger.debug(`⚠️ [applyThumbGroupImages] Слой "${fieldName}" не найден в "${container.name}"`);
      return;
    }
    
    Logger.debug(`🖼️ [applyThumbGroupImages] Применяем ${fieldName} к слою "${layer.name}"`);
    
    try {
      // Нормализуем URL
      let normalizedUrl = url;
      if (url.startsWith('//')) {
        normalizedUrl = `https:${url}`;
      }
      
      // Валидация URL
      try {
        const urlObj = new URL(normalizedUrl);
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
          Logger.debug(`⚠️ [applyThumbGroupImages] Неподдерживаемый протокол: ${urlObj.protocol}`);
          return;
        }
      } catch (urlErr) {
        Logger.debug(`⚠️ [applyThumbGroupImages] Невалидный URL: ${normalizedUrl}`);
        return;
      }
      
      // Загружаем изображение
      const response = await fetch(normalizedUrl);
      if (!response.ok) {
        Logger.debug(`❌ [applyThumbGroupImages] Ошибка загрузки ${fieldName}: ${response.status}`);
        return;
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Создаём hash изображения
      const imageHash = figma.createImage(uint8Array).hash;
      
      // Применяем к слою
      if ('fills' in layer) {
        const imagePaint: ImagePaint = {
          type: 'IMAGE',
          scaleMode: 'FIT',
          imageHash: imageHash
        };
        (layer as GeometryMixin).fills = [imagePaint];
        Logger.debug(`✅ [applyThumbGroupImages] ${fieldName} применён`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.debug(`❌ [applyThumbGroupImages] Ошибка ${fieldName}: ${msg}`);
    }
  });
  
  await Promise.all(loadPromises);
}

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
 * Обработка EOfferItem — модификаторы карточки предложения
 * Актуальные пропсы (2025-12): withButton, withReviews, withDelivery, withFintech, 
 * priceDisclaimer, withMeta, withFavoritesButton, withTitle, brand
 */
export async function handleEOfferItem(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;
  
  const containerName = (container && 'name' in container) ? String(container.name) : '';
  
  // Собираем все EOfferItem instances для обработки
  const eOfferItems: InstanceNode[] = [];
  
  // Если контейнер сам является EOfferItem
  if (containerName === 'EOfferItem' && container.type === 'INSTANCE' && !container.removed) {
    eOfferItems.push(container as InstanceNode);
  }
  
  // Ищем вложенные EOfferItem внутри контейнера (для EProductSnippet2 и других)
  if ('findAll' in container) {
    const nested = (container as FrameNode).findAll(n => 
      n.type === 'INSTANCE' && n.name === 'EOfferItem' && !n.removed
    ) as InstanceNode[];
    eOfferItems.push(...nested);
  }
  
  if (eOfferItems.length === 0) return;
  
  Logger.debug(`   📦 [EOfferItem] Найдено ${eOfferItems.length} EOfferItem в "${containerName}"`);
  
  // Обрабатываем каждый EOfferItem
  for (const instance of eOfferItems) {
    
    // withButton (variant "True"/"False") — показать кнопку покупки
    // Правило: для EOfferItem кнопка показывается ВСЕГДА
    // Пробуем как variant property со строкой "True", и как boolean
    let buttonResult = trySetProperty(instance, ['withButton'], 'True', '#EOfferItem_hasButton');
    if (!buttonResult) {
      // Если не сработало как variant, пробуем как boolean
      buttonResult = trySetProperty(instance, ['withButton'], true, '#EOfferItem_hasButton');
    }
    Logger.info(`   📱 [EOfferItem] withButton=True, result=${buttonResult}`);
    
    // withReviews (boolean) — показать рейтинг и отзывы
    const hasReviews = row['#EOfferItem_hasReviews'] === 'true' || !!(row['#ReviewsNumber'] && row['#ReviewsNumber'].trim() !== '');
    trySetProperty(instance, ['withReviews', 'RATING + REVIEW'], hasReviews, '#EOfferItem_hasReviews');
    
    // withDelivery (boolean) — показать доставку в мета-блоке
    // Для EOfferItem используем #DeliveryList или #EDeliveryGroup
    const hasDeliveryList = !!(row['#DeliveryList'] && row['#DeliveryList'].trim() !== '');
    const hasDeliveryGroup = row['#EDeliveryGroup'] === 'true';
    const hasDelivery = row['#EOfferItem_hasDelivery'] === 'true' || hasDeliveryList || hasDeliveryGroup;
    trySetProperty(instance, ['withDelivery', 'Delivery', 'DELIVERY + FINTECH'], hasDelivery, '#EOfferItem_hasDelivery');
    
    // withFintech (boolean) — показать финтех в EPriceGroup (Сплит/Пэй рядом с ценой)
    // Это НЕ влияет на withMeta — это отдельный блок в ценнике
    const hasFintech = row['#EOfferItem_Fintech'] === 'true' || row['#EPriceGroup_Fintech'] === 'true';
    trySetProperty(instance, ['withFintech', 'Fintech'], hasFintech, '#EOfferItem_Fintech');
    
    // priceDisclaimer (boolean) — "Цена, доставка от Маркета"
    const hasPriceDisclaimer = row['#PriceDisclaimer'] === 'true';
    trySetProperty(instance, ['priceDisclaimer', 'Price Disclaimer'], hasPriceDisclaimer, '#PriceDisclaimer');
    
    // withMeta (boolean) — показать ShopInfo-DeliveryBnplContainer (доставка + BNPL в мета-блоке)
    // НЕ включает EPriceGroup-Fintech — это другой блок
    const hasBnpl = row['#ShopInfo-Bnpl'] === 'true';
    const hasMeta = hasDelivery || hasBnpl;
    trySetProperty(instance, ['withMeta'], hasMeta, '#EOfferItem_withMeta');
    
    Logger.debug(`   📊 [EOfferItem] withMeta=${hasMeta} (hasDelivery=${hasDelivery}, hasBnpl=${hasBnpl}), withFintech=${hasFintech}`);
    
    // withFavoritesButton (boolean) — кнопка "В избранное"
    const hasFavorites = row['#FavoriteBtn'] === 'true';
    trySetProperty(instance, ['withFavoritesButton', '[EXP] Favotite Btn'], hasFavorites, '#FavoriteBtn');
    
    // withTitle (boolean) — показать название товара
    const hasTitle = !!(row['#OrganicTitle'] || row['#OfferTitle'] || '').trim();
    trySetProperty(instance, ['withTitle', 'Offer Title'], hasTitle, '#withTitle');
    
    // brand (boolean) — показать бренд
    const hasBrand = !!(row['#Brand'] || '').trim();
    trySetProperty(instance, ['brand', 'Brand'], hasBrand, '#Brand');
    
    Logger.debug(`   📦 [EOfferItem] Пропсы: withButton=true, withReviews=${hasReviews}, withDelivery=${hasDelivery}, withFintech=${hasFintech}, priceDisclaimer=${hasPriceDisclaimer}, withMeta=${hasMeta}, withFavoritesButton=${hasFavorites}, withTitle=${hasTitle}, brand=${hasBrand}`);
  }
}

/**
 * Обработка EShopItem — модификаторы карточки магазина
 * Актуальные пропсы (2025-12): brand, withButton, withReviews, withDelivery, withFintech,
 * priceDisclaimer, withMeta, favoriteBtn
 */
export async function handleEShopItem(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;
  
  const containerName = (container && 'name' in container) ? String(container.name) : '';
  if (containerName !== 'EShopItem') return;
  
  Logger.debug(`   📦 [EShopItem] Обработка модификаторов для "${row['#ShopName']}"`);
  
  if (container.type === 'INSTANCE' && !container.removed) {
    const instance = container as InstanceNode;
    
    // brand (boolean) — показать бренд
    const hasBrand = !!(row['#Brand'] || '').trim();
    trySetProperty(instance, ['brand', 'Brand'], hasBrand, '#Brand');
    
    // withButton (boolean) — показать кнопку
    // Логика: кнопка показывается только если Platform = Desktop или есть checkout
    // Если Platform = Touch — кнопка не показывается (кроме checkout)
    const isCheckout = row['#isCheckout'] === 'true' || row['#MarketCheckoutButton'] === 'true';
    
    // Читаем текущее значение Platform из компонента
    let isDesktop = true; // По умолчанию Desktop
    const props = instance.componentProperties;
    for (const key of Object.keys(props)) {
      if (key.toLowerCase() === 'platform' || key.toLowerCase().startsWith('platform#')) {
        const prop = props[key];
        if (prop && typeof prop === 'object' && 'value' in prop) {
          const platformValue = String((prop as { value: unknown }).value).toLowerCase();
          isDesktop = platformValue === 'desktop';
          Logger.debug(`   📱 [EShopItem] Platform="${platformValue}", isDesktop=${isDesktop}`);
          break;
        }
      }
    }
    
    // Кнопка показывается если: (Desktop) ИЛИ (checkout)
    const hasButton = isDesktop || isCheckout;
    trySetProperty(instance, ['withButton', 'buttons', 'BUTTONS'], hasButton, '#BUTTON');
    
    // withReviews (boolean) — показать отзывы
    const hasReviews = !!(row['#ReviewsNumber'] || row['#ShopInfo-Ugc'] || '').trim();
    trySetProperty(instance, ['withReviews'], hasReviews, '#withReviews');
    
    // withDelivery (boolean) — показать доставку в мета-блоке
    const hasDeliveryList = !!(row['#DeliveryList'] || '').trim();
    const hasDeliveryGroup = row['#EDeliveryGroup'] === 'true';
    const hasDelivery = hasDeliveryList || hasDeliveryGroup;
    trySetProperty(instance, ['withDelivery', 'delivery', 'Delivery'], hasDelivery, '#withDelivery');
    
    // withFintech (boolean) — показать финтех в EPriceGroup (Сплит/Пэй рядом с ценой)
    // Это НЕ влияет на withMeta — это отдельный блок в ценнике
    const hasFintech = row['#EPriceGroup_Fintech'] === 'true';
    trySetProperty(instance, ['withFintech', 'fintech', 'Fintech'], hasFintech, '#withFintech');
    
    // priceDisclaimer (boolean) — "Цена, доставка от Маркета"
    const hasPriceDisclaimer = row['#PriceDisclaimer'] === 'true';
    trySetProperty(instance, ['priceDisclaimer', 'Price Disclaimer'], hasPriceDisclaimer, '#PriceDisclaimer');
    
    // withMeta (boolean) — показать ShopInfo-DeliveryBnplContainer (доставка + BNPL в мета-блоке)
    // НЕ включает EPriceGroup-Fintech — это другой блок
    const hasBnpl = row['#ShopInfo-Bnpl'] === 'true';
    const hasMeta = hasDelivery || hasBnpl;
    trySetProperty(instance, ['withMeta', 'deliveryFintech'], hasMeta, '#withMeta');
    
    Logger.debug(`   📊 [EShopItem] withMeta=${hasMeta} (hasDelivery=${hasDelivery}, hasBnpl=${hasBnpl}), withFintech=${hasFintech}`);
    
    // favoriteBtn (boolean) — кнопка "В избранное"
    const hasFavoriteBtn = row['#FavoriteBtn'] === 'true';
    trySetProperty(instance, ['favoriteBtn', 'Favorite Btn', '[EXP] Favotite Btn'], hasFavoriteBtn, '#FavoriteBtn');
    
    Logger.debug(`   📦 [EShopItem] Пропсы: brand=${hasBrand}, withButton=${hasButton}, withReviews=${hasReviews}, withDelivery=${hasDelivery}, withFintech=${hasFintech}, priceDisclaimer=${hasPriceDisclaimer}, withMeta=${hasMeta}, favoriteBtn=${hasFavoriteBtn}`);
  }
}

/**
 * Обработка ESnippet — boolean пропсы карточки сниппета
 * Актуальные пропсы (2025-12): withReviews, withQuotes, withDelivery, withFintech,
 * withAddress, withSitelinks, withPromo, withButton, withMeta, withContacts, withPrice, showKebab
 */
export async function handleESnippetProps(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;
  
  const containerName = (container && 'name' in container) ? String(container.name) : '';
  if (containerName !== 'ESnippet' && containerName !== 'Snippet') return;
  
  Logger.debug(`   📦 [ESnippet] Обработка пропсов для "${row['#OrganicTitle']?.substring(0, 30)}..."`);
  
  if (container.type === 'INSTANCE' && !container.removed) {
    const instance = container as InstanceNode;
    
    // Диагностика: выводим все доступные свойства компонента
    const props = instance.componentProperties;
    const propNames = Object.keys(props);
    Logger.debug(`   📋 [ESnippet] Доступные свойства (${propNames.length}): ${propNames.join(', ')}`);
    
    // withReviews (boolean) — показать рейтинг и отзывы
    const hasReviews = !!(row['#ProductRating'] || row['#ShopInfo-Ugc'] || '').trim();
    trySetProperty(instance, ['withReviews'], hasReviews, '#withReviews');
    
    // withQuotes (boolean) — показать цитату из отзыва
    const hasQuotes = !!(row['#QuoteText'] || row['#EQuote-Text'] || '').trim();
    trySetProperty(instance, ['withQuotes'], hasQuotes, '#withQuotes');
    
    // withDelivery (boolean) — показать доставку
    // Для ESnippet используем #EDeliveryGroup (не #DeliveryList)
    const hasDeliveryGroup = row['#EDeliveryGroup'] === 'true';
    const hasDeliveryAbroad = row['#EDelivery_abroad'] === 'true';
    const hasDelivery = hasDeliveryGroup || hasDeliveryAbroad;
    trySetProperty(instance, ['withDelivery'], hasDelivery, '#withDelivery');
    
    // withFintech (boolean) — показать финтех в EPriceGroup (Сплит/Пэй рядом с ценой)
    // Это НЕ влияет на withMeta — это отдельный блок в ценнике
    const hasFintech = row['#EPriceGroup_Fintech'] === 'true';
    trySetProperty(instance, ['withFintech'], hasFintech, '#withFintech');
    
    Logger.debug(`   📊 [ESnippet] Данные: #EDeliveryGroup="${row['#EDeliveryGroup']}", #EDelivery_abroad="${row['#EDelivery_abroad']}", #ShopInfo-Bnpl="${row['#ShopInfo-Bnpl']}", #EPriceGroup_Fintech="${row['#EPriceGroup_Fintech']}"`);
    
    // withAddress (boolean) — показать адрес магазина
    const hasAddress = row['#hasShopOfflineRegion'] === 'true' || !!(row['#addressText'] || '').trim();
    trySetProperty(instance, ['withAddress'], hasAddress, '#withAddress');
    
    // withSitelinks (boolean) — показать сайтлинки
    const hasSitelinks = row['#Sitelinks'] === 'true';
    const sitelinksSet = trySetProperty(instance, ['withSitelinks', 'SITELINKS', 'Sitelinks'], hasSitelinks, '#withSitelinks');
    
    // Fallback: если свойство не найдено — скрываем/показываем слой напрямую
    if (!sitelinksSet) {
      const sitelinksLayer = instance.findOne(n => n.name === 'Sitelinks' || n.name === 'Block / Snippet-staff / Sitelinks');
      if (sitelinksLayer && 'visible' in sitelinksLayer) {
        try {
          (sitelinksLayer as SceneNode & { visible: boolean }).visible = hasSitelinks;
          Logger.debug(`   🔗 [ESnippet] Sitelinks fallback visible=${hasSitelinks}`);
        } catch (e) { /* ignore */ }
      }
    }
    
    // withPromo (boolean) — показать промо-блок
    const hasPromo = !!(row['#Promo'] || '').trim();
    trySetProperty(instance, ['withPromo'], hasPromo, '#withPromo');
    
    // withButton (boolean) — показать кнопку
    // Логика: кнопка показывается только если Platform = Desktop или есть checkout
    const isCheckout = row['#isCheckout'] === 'true' || row['#MarketCheckoutButton'] === 'true';
    
    // Читаем текущее значение Platform из компонента (используем props из диагностики выше)
    let isDesktop = true; // По умолчанию Desktop
    for (const key of propNames) {
      if (key.toLowerCase() === 'platform' || key.toLowerCase().startsWith('platform#')) {
        const prop = props[key];
        if (prop && typeof prop === 'object' && 'value' in prop) {
          const platformValue = String((prop as { value: unknown }).value).toLowerCase();
          isDesktop = platformValue === 'desktop';
          Logger.debug(`   📱 [ESnippet] Platform="${platformValue}", isDesktop=${isDesktop}`);
          break;
        }
      }
    }
    
    // Кнопка показывается если: (Desktop) ИЛИ (checkout)
    const hasButton = isDesktop || isCheckout;
    trySetProperty(instance, ['withButton'], hasButton, '#withButton');
    
    // withMeta (boolean) — показать ShopInfo-DeliveryBnplContainer (доставка + BNPL в мета-блоке)
    // НЕ включает hasFintech — это EPriceGroup-Fintech, другой блок
    const hasBnpl = row['#ShopInfo-Bnpl'] === 'true';
    const hasMeta = hasDelivery || hasBnpl;
    const metaSet = trySetProperty(instance, ['withMeta'], hasMeta, '#withMeta');
    Logger.debug(`   📦 [ESnippet] withMeta=${hasMeta} (hasDelivery=${hasDelivery}, hasBnpl=${hasBnpl}), set=${metaSet}`);
    
    // withContacts (boolean) — показать контакты
    const hasContacts = !!(row['#Phone'] || row['#Contacts'] || '').trim();
    trySetProperty(instance, ['withContacts'], hasContacts, '#withContacts');
    
    // withPrice (boolean) — показать блок цены
    const hasPrice = !!(row['#OrganicPrice'] || '').trim();
    trySetProperty(instance, ['withPrice'], hasPrice, '#withPrice');
    
    // showKebab (boolean) — показать меню (обычно false)
    const showKebab = row['#showKebab'] === 'true';
    trySetProperty(instance, ['showKebab'], showKebab, '#showKebab');
    
    // isOfficial (boolean) — официальный магазин
    // НЕ делаем fallback на visible — Verified элемент может быть для других целей
    const isOfficial = row['#OfficialShop'] === 'true';
    const officialSet = trySetProperty(instance, ['isOfficial', 'official', 'Official'], isOfficial, '#isOfficial');
    Logger.debug(`   🏪 [ESnippet] isOfficial=${isOfficial}, trySetProperty=${officialSet}`);
    
    // --- ТЕКСТОВЫЕ СВОЙСТВА ---
    
    // organicTitle (string) — заголовок сниппета
    const organicTitle = (row['#OrganicTitle'] || '').trim();
    if (organicTitle) {
      trySetProperty(instance, ['organicTitle'], organicTitle, '#OrganicTitle');
    }
    
    // organicText (string) — текст/описание сниппета
    const organicText = (row['#OrganicText'] || '').trim();
    if (organicText) {
      trySetProperty(instance, ['organicText'], organicText, '#OrganicText');
    }
    
    // organicHost (string) — хост (greenurl)
    const organicHost = (row['#OrganicHost'] || '').trim();
    if (organicHost) {
      trySetProperty(instance, ['organicHost'], organicHost, '#OrganicHost');
    }
    
    Logger.debug(`   📦 [ESnippet] Пропсы: withReviews=${hasReviews}, withQuotes=${hasQuotes}, withDelivery=${hasDelivery}, withFintech=${hasFintech}, withAddress=${hasAddress}, withButton=${hasButton}, withMeta=${hasMeta}, withPrice=${hasPrice}`);
    Logger.debug(`   📝 [ESnippet] Тексты: title=${organicTitle?.substring(0, 30)}..., host=${organicHost}`);
  }
}

/**
 * Обработка Rating + Review + Quote — DEPRECATED
 * Visibility теперь управляется через withReviews/withQuotes на сниппете
 * Оставлен только для логирования
 */
export async function handleRatingReviewQuoteVisibility(context: HandlerContext): Promise<void> {
  // Visibility теперь через withReviews/withQuotes на сниппете — ничего не делаем
  // Логика перенесена в handleESnippetProps, handleEShopItem, handleEOfferItem
  Logger.debug(`   📊 [RatingReviewQuote] Visibility через withReviews/withQuotes`);
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

/**
 * Обработка скрытия Price Block для страниц каталога (EThumbGroup)
 * Каталожные страницы не имеют цены — скрываем блок с ценой
 */
export function handleHidePriceBlock(context: HandlerContext): void {
  const { container, row } = context;
  
  // Диагностика
  const containerName = container && 'name' in container ? container.name : 'NULL';
  const hasRow = row !== null && row !== undefined;
  const hidePriceBlockValue = row ? row['#hidePriceBlock'] : undefined;
  
  Logger.debug(`💰 [hidePriceBlock] ВХОД: container="${containerName}", row=${hasRow ? 'да' : 'НЕТ'}, #hidePriceBlock=${hidePriceBlockValue || 'N/A'}`);
  
  if (!container || !row) return;

  const hidePriceBlock = row['#hidePriceBlock'] === 'true';
  if (!hidePriceBlock) return;
  
  // Скрываем Price Block через withPrice property на контейнере
  const instance = container.type === 'INSTANCE' ? container : null;
  if (instance) {
    const result = trySetProperty(instance, ['withPrice', 'PRICE', 'Price'], false, '#hidePriceBlock');
    if (result) {
      Logger.debug(`   💰 [PriceBlock] Скрыт через withPrice (страница каталога)`);
    }
  }
}

/**
 * Обработка imageType — переключение между EThumb и EThumbGroup
 * Instance swap property для отображения одной картинки или коллажа
 */
export async function handleImageType(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  
  // Диагностика — выводим ВСЕГДА (даже если row/container пустые)
  const containerName = container && 'name' in container ? container.name : 'NULL';
  const containerType = container && 'type' in container ? container.type : 'NULL';
  const hasRow = row !== null && row !== undefined;
  
  Logger.debug(`🖼️ [imageType] ВХОД: container="${containerName}" (${containerType}), row=${hasRow ? 'да' : 'НЕТ'}`);
  
  if (!container || !row) {
    Logger.debug(`🖼️ [imageType] ПРОПУСК: container=${!!container}, row=${!!row}`);
    return;
  }

  const imageType = row['#imageType'];
  const isCatalogPage = row['#isCatalogPage'];
  
  // Диагностика — выводим данные из row
  Logger.debug(`🖼️ [imageType] Данные: imageType=${imageType || 'N/A'}, isCatalogPage=${isCatalogPage || 'N/A'}`);
  
  // ВАЖНО: Независимо от imageType, пробуем применить изображения к EThumbGroup
  // Это нужно потому что в Figma может быть EThumbGroup по умолчанию
  // Ищем слой #Image1 — если он есть и виден, применяем изображения
  // Проверяем что container является SceneNode (имеет 'type')
  if ('type' in container && container.type !== 'DOCUMENT' && container.type !== 'PAGE') {
    const sceneContainer = container as SceneNode;
    const hasImage1Layer = findLayerDeep(sceneContainer, '#Image1') !== null;
    
    if (hasImage1Layer) {
      Logger.debug(`🖼️ [imageType] Найден слой #Image1 — применяем изображения к EThumbGroup`);
      await applyThumbGroupImages(sceneContainer, row);
    }
  }
  
  // Определяем целевое состояние: EThumb (одна картинка) или EThumbGroup (коллаж)
  const targetState = (!imageType || imageType === 'EThumb') ? 'Default' : 'EThumbGroup';
  
  Logger.debug(`🖼️ [imageType] Целевое состояние: ${targetState} (imageType=${imageType || 'N/A'})`);
  
  // Ищем INSTANCE для изменения State property
  
  // Нужен EThumbGroup — ищем instance на котором есть свойство imageType
  // Контейнер может быть INSTANCE или FRAME (с INSTANCE внутри)
  let targetInstance: InstanceNode | null = null;
  
  if (container.type === 'INSTANCE') {
    targetInstance = container as InstanceNode;
  } else if ('findOne' in container) {
    // Контейнер не INSTANCE — ищем внутри первый INSTANCE
    const innerInstance = (container as FrameNode).findOne(n => n.type === 'INSTANCE');
    if (innerInstance) {
      targetInstance = innerInstance as InstanceNode;
      Logger.debug(`🖼️ [imageType] Найден внутренний INSTANCE: ${innerInstance.name}`);
    }
  }
  
  if (!targetInstance) {
    Logger.debug(`🖼️ [imageType] INSTANCE не найден (container.type=${container.type})`);
    return;
  }
  
  const instance = targetInstance;
  
  // Ищем вложенный EThumb instance для установки State property
  let eThumbInstance: InstanceNode | null = null;
  
  if (instance.name.toLowerCase().includes('ethumb')) {
    eThumbInstance = instance;
  } else if ('findOne' in instance) {
    const nodeWithFindOne = instance as unknown as { findOne: (callback: (node: SceneNode) => boolean) => SceneNode | null };
    eThumbInstance = nodeWithFindOne.findOne(n => {
      if (n.type !== 'INSTANCE') return false;
      return n.name.toLowerCase().includes('ethumb') || n.name.toLowerCase().includes('thumb');
    }) as InstanceNode | null;
  }
  
  // Пробуем установить State property
  if (eThumbInstance) {
    const eThumbProps = eThumbInstance.componentProperties;
    Logger.debug(`🖼️ [imageType] EThumb найден: "${eThumbInstance.name}", свойства: ${Object.keys(eThumbProps).join(', ')}`);
    
    // Ищем property State
    for (const key in eThumbProps) {
      const keyLower = key.toLowerCase();
      if (keyLower === 'state' || keyLower.startsWith('state#')) {
        const stateProp = eThumbProps[key];
        if (stateProp && typeof stateProp === 'object' && 'type' in stateProp) {
          Logger.debug(`🖼️ [imageType] Найдено State property: "${key}", type=${stateProp.type}, value="${(stateProp as any).value}"`);
          
          if (stateProp.type === 'VARIANT') {
            try {
              eThumbInstance.setProperties({ [key]: targetState });
              Logger.debug(`✅ [imageType] State установлен: ${targetState}`);
              
              // Если переключили на Default — применяем одиночное изображение
              if (targetState === 'Default') {
                await applySingleImage(container as SceneNode, row);
                return;
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              Logger.warn(`⚠️ [imageType] Ошибка установки State: ${msg}`);
            }
          }
        }
        break;
      }
    }
  }
  
  // Если targetState = Default, применяем одиночное изображение и выходим
  if (targetState === 'Default') {
    Logger.debug(`🖼️ [imageType] Целевое состояние Default — применяем одиночное изображение`);
    await applySingleImage(container as SceneNode, row);
    return;
  }
  
  // Проверяем есть ли свойство imageType (для переключения через instance swap)
  const props = instance.componentProperties;
  let imageTypeKey: string | null = null;
  
  Logger.debug(`🖼️ [imageType] Поиск свойства imageType на ${instance.name}`);
  Logger.debug(`🖼️ [imageType] Доступные свойства: ${Object.keys(props).join(', ')}`);
  
  for (const key in props) {
    // Ищем свойство с именем imageType (может быть imageType#123:456, ImageType, Type и т.д.)
    const keyLower = key.toLowerCase();
    if (keyLower === 'imagetype' || 
        keyLower.startsWith('imagetype#') ||
        keyLower === 'type' || 
        keyLower.startsWith('type#')) {
      imageTypeKey = key;
      break;
    }
  }
  
  if (!imageTypeKey) {
    Logger.debug(`🖼️ [imageType] Свойство imageType НЕ НАЙДЕНО`);
    return;
  }
  
  const prop = props[imageTypeKey];
  if (!prop || typeof prop !== 'object' || !('type' in prop)) return;
  
  Logger.debug(`🖼️ [imageType] Найдено свойство "${imageTypeKey}", type=${prop.type}`);
  
  // Instance swap property имеет type = 'INSTANCE_SWAP'
  if (prop.type !== 'INSTANCE_SWAP') {
    Logger.debug(`   🖼️ [imageType] Свойство "${imageTypeKey}" не является INSTANCE_SWAP (type=${prop.type})`);
    return;
  }
  
  try {
    // Для instance swap нужно найти компонент по имени и получить его key
    const targetComponentName = imageType || ''; // 'EThumbGroup'
    if (!targetComponentName) {
      Logger.debug(`⚠️ [imageType] Пустое значение imageType`);
      return;
    }
    
    // Ищем компонент в кэше (O(1) вместо findAll по всей странице)
    const cachedComponent = getCachedComponent(targetComponentName);
    const components = cachedComponent ? [cachedComponent] : [];
    
    if (components.length === 0) {
      // Пробуем найти среди published components — это может быть component set
      // Для instance swap с exposed property можно использовать preferredValues
      const preferredValues = (prop as any).preferredValues;
      const currentValue = (prop as any).value;
      
      if (preferredValues && Array.isArray(preferredValues)) {
        Logger.debug(`🖼️ [imageType] preferredValues: ${JSON.stringify(preferredValues)}`);
        Logger.debug(`🖼️ [imageType] currentValue: ${currentValue}`);
        
        // preferredValues может быть массивом объектов {type, key} или просто строк
        // Проверяем формат
        const isObjectArray = preferredValues.length > 0 && typeof preferredValues[0] === 'object';
        
        let targetKey: string | null = null;
        
        if (isObjectArray) {
          // Формат: [{type: 'COMPONENT', key: '...'}]
          // Ищем альтернативный вариант (не текущий)
          const alternative = preferredValues.find((v: any) => v.key !== currentValue);
          if (alternative) {
            targetKey = alternative.key;
            Logger.debug(`🖼️ [imageType] Найден альтернативный вариант (объект): key=${targetKey}`);
          }
        } else {
          // Формат: ['key1', 'key2'] — массив строк-ключей
          const alternative = preferredValues.find((v: string) => v !== currentValue);
          if (alternative) {
            targetKey = alternative;
            Logger.debug(`🖼️ [imageType] Найден альтернативный вариант (строка): key=${targetKey}`);
          }
        }
        
        if (targetKey) {
          Logger.debug(`🖼️ [imageType] Найден component key: ${targetKey}`);
          
          // EThumbGroup теперь ВАРИАНТ внутри ComponentSet EThumb!
          // Ищем вложенный instance EThumb и переключаем на нужный вариант
          // Используем findOne вместо рекурсии для производительности
          
          let eThumbInstance: InstanceNode | null = null;
          if ('findOne' in instance) {
            // InstanceNode имеет findOne через ChildrenMixin
            const nodeWithFindOne = instance as unknown as { findOne: (callback: (node: SceneNode) => boolean) => SceneNode | null };
            eThumbInstance = nodeWithFindOne.findOne(n => {
              if (n.type !== 'INSTANCE') return false;
              const nameLower = n.name.toLowerCase();
              return nameLower.includes('ethumb') || nameLower.includes('thumb') || nameLower === 'imagetype';
            }) as InstanceNode | null;
          }
          
          if (eThumbInstance) {
            Logger.debug(`🖼️ [imageType] Найден вложенный EThumb: "${eThumbInstance.name}" (id=${eThumbInstance.id})`);
            
            const mainComp = await eThumbInstance.getMainComponentAsync();
            if (mainComp && mainComp.parent && mainComp.parent.type === 'COMPONENT_SET') {
              const componentSet = mainComp.parent as ComponentSetNode;
              Logger.debug(`🖼️ [imageType] ComponentSet: "${componentSet.name}" с ${componentSet.children.length} вариантами`);
              
              // Логируем ВСЕ варианты для диагностики
              Logger.debug(`🖼️ [imageType] Все варианты:`);
              componentSet.children.forEach((child, i) => {
                if (child.type === 'COMPONENT') {
                  const isCurrent = child.id === mainComp.id;
                  Logger.debug(`   ${i + 1}. "${child.name}" (id=${child.id}, key=${child.key}) ${isCurrent ? '← ТЕКУЩИЙ' : ''}`);
                }
              });
              
              // Ищем вариант с "group" в имени
              let targetVariant = componentSet.children.find((child) => {
                if (child.type !== 'COMPONENT') return false;
                const nameLower = child.name.toLowerCase();
                return nameLower.includes('group') || nameLower.includes('collage') || nameLower.includes('thumbgroup');
              }) as ComponentNode | undefined;
              
              if (targetVariant) {
                Logger.debug(`🖼️ [imageType] Найден вариант "group": "${targetVariant.name}" (id=${targetVariant.id})`);
                Logger.debug(`🖼️ [imageType] Устанавливаем ${imageTypeKey}=${targetVariant.id}`);
                
                try {
                  instance.setProperties({ [imageTypeKey]: targetVariant.id });
                  Logger.debug(`✅ [imageType] Успешно установлен EThumbGroup!`);
                  
                  // После переключения применяем изображения к новым слоям
                  await applyThumbGroupImages(instance, row);
                  
                  return;
                } catch (setErr) {
                  const msg = setErr instanceof Error ? setErr.message : String(setErr);
                  Logger.warn(`⚠️ [imageType] Ошибка setProperties: ${msg}`);
                }
              } else {
                Logger.debug(`⚠️ [imageType] Вариант с "group" не найден среди ${componentSet.children.length} вариантов`);
                // Fallback: применяем изображения к текущему варианту
                await applyThumbGroupImages(instance, row);
              }
            } else {
              // ComponentSet не найден — применяем изображения к текущему instance
              await applyThumbGroupImages(instance, row);
            }
          } else {
            Logger.debug(`⚠️ [imageType] Вложенный EThumb instance не найден`);
            // Fallback: применяем изображения напрямую к контейнеру
            await applyThumbGroupImages(instance, row);
          }
          
          // Fallback: Попробуем импортировать как library компонент
          try {
            const importedComponent = await figma.importComponentByKeyAsync(targetKey);
            Logger.debug(`🖼️ [imageType] Импортирован: "${importedComponent.name}" (id=${importedComponent.id})`);
            instance.setProperties({ [imageTypeKey]: importedComponent.id });
            Logger.debug(`✅ [imageType] Успешно установлен EThumbGroup!`);
            return;
          } catch (importErr) {
            const msg = importErr instanceof Error ? importErr.message : String(importErr);
            Logger.warn(`❌ [imageType] Ошибка импорта: ${msg}`);
          }
        }
      }
      
      Logger.debug(`⚠️ [imageType] Альтернативный вариант не найден в preferredValues`);
      return;
    }
    
    const targetComponent = components[0];
    const componentKey = targetComponent.key;
    
    // ВАЖНО: используем ПОЛНЫЙ ключ свойства (с #ID)
    Logger.debug(`🖼️ [imageType] Устанавливаем ${imageTypeKey}=${targetComponentName} (key=${componentKey})`);
    instance.setProperties({ [imageTypeKey]: componentKey });
    
    Logger.debug(`✅ [imageType] Установлен imageType="${imageType}"`);
  } catch (e) {
    Logger.error(`❌ [imageType] Ошибка установки imageType="${imageType}":`, e);
  }
}

/**
 * Управление видимостью группы Meta — DEPRECATED
 * Visibility теперь управляется через withMeta на сниппете
 */
export function handleMetaVisibility(context: HandlerContext): void {
  // Visibility теперь через withMeta на сниппете — ничего не делаем
  Logger.debug(`📦 [Meta] Visibility через withMeta на сниппете`);
}

