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
import { 
  getCachedInstance, 
  getGroupsSortedByDepth,
  shouldProcessGroupForEmptyCheck,
  areAllChildrenHidden,
  hasAnyVisibleChild
} from '../utils/instance-cache';
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
 * Находит все слои с fills внутри контейнера (для изображений)
 */
function findAllFillableLayers(node: SceneNode): SceneNode[] {
  const result: SceneNode[] = [];
  
  if ('fills' in node && node.type !== 'TEXT') {
    result.push(node);
  }
  
  if ('children' in node) {
    for (const child of (node as FrameNode | GroupNode).children) {
      result.push(...findAllFillableLayers(child));
    }
  }
  
  return result;
}

/**
 * Применяет изображения к слоям #Image1, #Image2, #Image3 внутри EThumbGroup
 * Вызывается ПОСЛЕ переключения imageType на EThumbGroup
 * 
 * FALLBACK: если #Image1 пустой но есть #OrganicImage — используем его
 * 
 * Поиск слоёв:
 * 1. Сначала ищем слои с точными именами #Image1, #Image2, #Image3
 * 2. Если не найдены, ищем слои EThumbGroup-Main, EThumbGroup-Item_topRight, EThumbGroup-Item_bottomRight
 * 3. Если не найдены, ищем по именам Image Ratio, EThumb-Image
 * 4. Fallback: находим все fillable слои и применяем по порядку
 */
async function applyThumbGroupImages(container: SceneNode, row: CSVRow): Promise<void> {
  // FALLBACK: Если #Image1 пустой, используем #OrganicImage
  const image1 = row['#Image1'] || row['#OrganicImage'] || row['#ThumbImage'] || '';
  const image2 = row['#Image2'] || '';
  const image3 = row['#Image3'] || '';
  
  const imageUrls = [image1, image2, image3];
  
  Logger.debug(`🖼️ [applyThumbGroupImages] Начало для "${container.name}", URL: Image1="${image1.substring(0, 50)}...", Image2="${image2.substring(0, 50)}...", Image3="${image3.substring(0, 50)}..."`);
  
  // Стратегия 1: Ищем слои по точным именам
  const exactNames = [
    ['#Image1', 'Image1', 'EThumbGroup-Main'],
    ['#Image2', 'Image2', 'EThumbGroup-Item_topRight'],
    ['#Image3', 'Image3', 'EThumbGroup-Item_bottomRight']
  ];
  
  const foundLayers: (SceneNode | null)[] = [null, null, null];
  
  for (let i = 0; i < 3; i++) {
    for (const name of exactNames[i]) {
      const layer = findLayerDeep(container, name);
      if (layer && 'fills' in layer) {
        foundLayers[i] = layer;
        Logger.debug(`🖼️ [applyThumbGroupImages] Найден слой для Image${i + 1}: "${layer.name}"`);
        break;
      }
    }
  }
  
  // Стратегия 2: Ищем по общим именам изображений
  if (!foundLayers[0]) {
    const generalNames = ['Image Ratio', 'EThumb-Image', '#OrganicImage', '#ThumbImage'];
    for (const name of generalNames) {
      const layer = findLayerDeep(container, name);
      if (layer && 'fills' in layer) {
        foundLayers[0] = layer;
        Logger.debug(`🖼️ [applyThumbGroupImages] Fallback: найден слой "${layer.name}" для Image1`);
        break;
      }
    }
  }
  
  // Стратегия 3: Ищем все fillable слои с соответствующими размерами
  if (!foundLayers[0] && !foundLayers[1] && !foundLayers[2]) {
    Logger.debug(`🖼️ [applyThumbGroupImages] Поиск всех fillable слоёв...`);
    const allFillables = findAllFillableLayers(container);
    
    // Фильтруем только те, что похожи на слоты изображений (не слишком маленькие)
    const imageLayers = allFillables.filter(l => {
      if (!('width' in l)) return false;
      const w = (l as SceneNode & { width: number }).width;
      const h = (l as SceneNode & { height: number }).height;
      return w > 30 && h > 30; // Минимальный размер для изображения
    });
    
    Logger.debug(`🖼️ [applyThumbGroupImages] Найдено ${imageLayers.length} потенциальных слоёв`);
    
    // Сортируем по размеру (самый большой = главное изображение)
    imageLayers.sort((a, b) => {
      const areaA = ('width' in a ? (a as any).width : 0) * ('height' in a ? (a as any).height : 0);
      const areaB = ('width' in b ? (b as any).width : 0) * ('height' in b ? (b as any).height : 0);
      return areaB - areaA;
    });
    
    for (let i = 0; i < Math.min(3, imageLayers.length); i++) {
      foundLayers[i] = imageLayers[i];
      Logger.debug(`🖼️ [applyThumbGroupImages] Автоподбор: слой "${imageLayers[i].name}" для Image${i + 1}`);
    }
  }
  
  // Параллельная загрузка изображений
  const loadPromises = foundLayers.map(async (layer, i) => {
    const url = imageUrls[i];
    const fieldName = `Image${i + 1}`;
    
    if (!url || url.trim() === '') {
      Logger.debug(`⚠️ [applyThumbGroupImages] ${fieldName} — URL пустой, пропуск`);
      return;
    }
    
    if (!layer) {
      Logger.debug(`⚠️ [applyThumbGroupImages] ${fieldName} — слой не найден, пропуск`);
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
        Logger.debug(`✅ [applyThumbGroupImages] ${fieldName} применён к "${layer.name}"`);
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
    
    // withData (boolean) — показать весь блок Meta (рейтинг, доставка, bnpl)
    // true если есть хоть что-то из: рейтинг, доставка, BNPL
    const hasData = hasReviews || hasDelivery || hasBnpl;
    trySetProperty(instance, ['withData'], hasData, '#EOfferItem_withData');
    
    Logger.debug(`   📊 [EOfferItem] withMeta=${hasMeta}, withData=${hasData} (reviews=${hasReviews}, delivery=${hasDelivery}, bnpl=${hasBnpl}), withFintech=${hasFintech}`);
    
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
  const { container, row, instanceCache } = context;
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
    
    // withData (boolean) — показать весь блок Meta (рейтинг, доставка, bnpl)
    // true если есть хоть что-то из: рейтинг, доставка, BNPL
    const hasData = hasReviews || hasDelivery || hasBnpl;
    trySetProperty(instance, ['withData'], hasData, '#EShopItem_withData');
    
    Logger.debug(`   📊 [EShopItem] withMeta=${hasMeta}, withData=${hasData} (reviews=${hasReviews}, delivery=${hasDelivery}, bnpl=${hasBnpl}), withFintech=${hasFintech}`);
    
    // favoriteBtn (boolean) — кнопка "В избранное"
    const hasFavoriteBtn = row['#FavoriteBtn'] === 'true';
    trySetProperty(instance, ['favoriteBtn', 'Favorite Btn', '[EXP] Favotite Btn'], hasFavoriteBtn, '#FavoriteBtn');
    
    // --- ТЕКСТОВЫЕ СВОЙСТВА ---
    
    // organicTitle (string) — название товара
    const organicTitle = (row['#OrganicTitle'] || '').trim();
    if (organicTitle) {
      trySetProperty(instance, ['organicTitle'], organicTitle, '#OrganicTitle');
    }
    
    // organicText (string) — описание/текст сниппета
    const organicText = (row['#OrganicText'] || '').trim();
    if (organicText) {
      trySetProperty(instance, ['organicText'], organicText, '#OrganicText');
    }
    
    // --- ВЛОЖЕННЫЕ КОМПОНЕНТЫ ---
    
    // EShopName.name (string) — название магазина
    const shopName = (row['#ShopName'] || '').trim();
    if (shopName && instanceCache) {
      const shopNameInstance = getCachedInstance(instanceCache, 'EShopName');
      if (shopNameInstance) {
        trySetProperty(shopNameInstance, ['name'], shopName, '#ShopName');
        Logger.debug(`   🏪 [EShopItem] ShopName: "${shopName}"`);
      } else {
        Logger.debug(`   ⚠️ [EShopItem] EShopName не найден для установки name`);
      }
    }
    
    Logger.debug(`   📦 [EShopItem] Пропсы: brand=${hasBrand}, withButton=${hasButton}, withReviews=${hasReviews}, withDelivery=${hasDelivery}, withFintech=${hasFintech}, priceDisclaimer=${hasPriceDisclaimer}, withMeta=${hasMeta}, favoriteBtn=${hasFavoriteBtn}`);
    Logger.debug(`   📝 [EShopItem] Тексты: title="${organicTitle?.substring(0, 30)}...", text="${organicText?.substring(0, 30)}...", shop="${shopName}"`);
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
    
    // Определяем, является ли это plain Organic (fallback на ESnippet)
    const isPlainOrganic = row['#SnippetType'] === 'Organic';
    if (isPlainOrganic) {
      Logger.debug(`   📦 [ESnippet] Plain Organic → принудительно отключаем товарные фичи`);
      // Plain Organic: принудительно скрываем все товарные элементы
      trySetProperty(instance, ['withEcomMeta'], false, '#withEcomMeta');
      trySetProperty(instance, ['withButton'], false, '#withButton');
      trySetProperty(instance, ['withData'], false, '#withData');
      trySetProperty(instance, ['withMeta'], false, '#withMeta');
      trySetProperty(instance, ['withPrice'], false, '#withPrice');
      trySetProperty(instance, ['withDelivery'], false, '#withDelivery');
      trySetProperty(instance, ['withFintech'], false, '#withFintech');
      trySetProperty(instance, ['withAddress'], false, '#withAddress');
      trySetProperty(instance, ['withContacts'], false, '#withContacts');
      trySetProperty(instance, ['withPromo'], false, '#withPromo');
    }
    
    // withThumb (boolean) — показать картинку сниппета
    const hasThumb = row['#withThumb'] === 'true';
    const thumbPropSet = trySetProperty(instance, ['withThumb'], hasThumb, '#withThumb');
    Logger.debug(`   🖼️ [ESnippet] withThumb=${hasThumb}`);
    
    // Fallback: если withThumb=false, принудительно скрываем EThumb-слой
    // Это нужно, чтобы серый placeholder не оставался видимым, даже если
    // свойство компонента не смогло полностью скрыть изображение
    if (!hasThumb) {
      const eThumbLayer = findFirstNodeByName(instance, 'EThumb') ||
                          findFirstNodeByName(instance, 'Organic-OfferThumb') ||
                          findFirstNodeByName(instance, 'Thumb');
      if (eThumbLayer && 'visible' in eThumbLayer) {
        try {
          (eThumbLayer as SceneNode & { visible: boolean }).visible = false;
          Logger.debug(`   🖼️ [ESnippet] EThumb layer hidden (fallback)`);
        } catch (_e) { /* ignore */ }
      }
    }

    // withReviews (boolean) — показать рейтинг и отзывы
    const hasReviews = !!(row['#ProductRating'] || row['#ShopInfo-Ugc'] || '').trim();
    trySetProperty(instance, ['withReviews'], hasReviews, '#withReviews');
    
    // withQuotes (boolean) — показать цитату из отзыва
    // Читаем из row['#withQuotes'] (установлен парсером) или проверяем наличие текста цитаты
    const hasQuotes = row['#withQuotes'] === 'true' || !!(row['#QuoteText'] || row['#EQuote-Text'] || '').trim();
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
    
    // Кнопка показывается если: (есть данные кнопки И Desktop) ИЛИ (checkout)
    // Для plain Organic: #BUTTON = 'false' → кнопка скрыта даже на Desktop
    const hasButtonData = row['#BUTTON'] === 'true';
    const hasButton = (hasButtonData && isDesktop) || isCheckout;
    trySetProperty(instance, ['withButton'], hasButton, '#withButton');
    
    // withMeta (boolean) — показать ShopInfo-DeliveryBnplContainer (доставка + BNPL в мета-блоке)
    // НЕ включает hasFintech — это EPriceGroup-Fintech, другой блок
    const hasBnpl = row['#ShopInfo-Bnpl'] === 'true';
    const hasMeta = hasDelivery || hasBnpl;
    const metaSet = trySetProperty(instance, ['withMeta'], hasMeta, '#withMeta');
    Logger.debug(`   📦 [ESnippet] withMeta=${hasMeta} (hasDelivery=${hasDelivery}, hasBnpl=${hasBnpl}), set=${metaSet}`);
    
    // withData (boolean) — показать весь блок Meta (рейтинг, доставка, fintech, адрес)
    // true если есть хоть что-то из: рейтинг, доставка, BNPL
    const hasData = hasReviews || hasDelivery || hasBnpl;
    const dataSet = trySetProperty(instance, ['withData'], hasData, '#withData');
    Logger.debug(`   📊 [ESnippet] withData=${hasData} (reviews=${hasReviews}, delivery=${hasDelivery}, bnpl=${hasBnpl}), set=${dataSet}`);
    
    // withContacts (boolean) — показать контакты
    const hasContacts = !!(row['#Phone'] || row['#Contacts'] || '').trim();
    trySetProperty(instance, ['withContacts'], hasContacts, '#withContacts');
    
    // withPrice (boolean) — показать блок цены
    const hasPrice = !!(row['#OrganicPrice'] || '').trim();
    trySetProperty(instance, ['withPrice'], hasPrice, '#withPrice');
    
    // withEcomMeta (boolean) — показать блок EcomMeta (рейтинг + цена + барометр + лейблы)
    const hasEcomMeta = [
      row['#ProductRating'], row['#ReviewCount'], row['#OrganicPrice'],
      row['#OldPrice'], row['#EPriceBarometer_View'], row['#ELabelGroup']
    ].some(v => v !== undefined && v !== null && v !== '' && v !== 'false');
    trySetProperty(instance, ['withEcomMeta'], hasEcomMeta, '#withEcomMeta');
    Logger.debug(`   📦 [ESnippet] withEcomMeta=${hasEcomMeta}`);
    
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
    
    // --- САЙТЛИНКИ (для промо-сниппетов) ---
    if (hasSitelinks) {
      // Ищем контейнер сайтлинков
      const sitelinksContainer = findFirstNodeByName(instance, 'Sitelinks') ||
                                 findFirstNodeByName(instance, 'Block / Snippet-staff / Sitelinks');
      if (sitelinksContainer) {
        // Собираем все тексты сайтлинков из row
        const sitelinkTexts: string[] = [];
        for (let i = 1; i <= 4; i++) {
          const text = (row[`#Sitelink_${i}`] || '').trim();
          if (text) sitelinkTexts.push(text);
        }
        
        if (sitelinkTexts.length > 0) {
          // Способ 1: Ищем именованные слои #Sitelink_N или Sitelink_N
          let filledCount = 0;
          for (let i = 1; i <= sitelinkTexts.length; i++) {
            const sitelinkLayer = findTextLayerByName(sitelinksContainer, `#Sitelink_${i}`) ||
                                  findTextLayerByName(sitelinksContainer, `Sitelink_${i}`);
            if (sitelinkLayer) {
              await safeSetTextNode(sitelinkLayer, sitelinkTexts[i - 1]);
              Logger.debug(`   🔗 [ESnippet] Sitelink_${i}: "${sitelinkTexts[i - 1]}"`);
              filledCount++;
            }
          }
          
          // Способ 2: Если именованные слои не найдены — ищем Sitelinks-Item
          if (filledCount === 0) {
            // Ищем все Sitelinks-Item внутри контейнера
            const sitelinkItems: SceneNode[] = [];
            if ('findAll' in sitelinksContainer) {
              const found = (sitelinksContainer as FrameNode).findAll(n => 
                n.name === 'Sitelinks-Item' || n.name.includes('Sitelinks-Item')
              );
              sitelinkItems.push(...found);
            }
            
            if (sitelinkItems.length > 0) {
              Logger.debug(`   🔗 [ESnippet] Найдено ${sitelinkItems.length} Sitelinks-Item`);
              
              for (let i = 0; i < Math.min(sitelinkItems.length, sitelinkTexts.length); i++) {
                const item = sitelinkItems[i];
                // Ищем текстовый слой внутри Sitelinks-Item
                const textNode = findFirstTextByPredicate(item, () => true);
                if (textNode) {
                  await safeSetTextNode(textNode, sitelinkTexts[i]);
                  Logger.debug(`   🔗 [ESnippet] Sitelinks-Item[${i}]: "${sitelinkTexts[i]}"`);
                  filledCount++;
                }
              }
            }
          }
          
          // Способ 3: Fallback — ищем все текстовые слои Sitelinks-Title
          if (filledCount === 0) {
            const titleNodes: TextNode[] = [];
            if ('findAll' in sitelinksContainer) {
              const found = (sitelinksContainer as FrameNode).findAll(n => 
                n.type === 'TEXT' && (n.name === 'Sitelinks-Title' || n.name.includes('Title'))
              ) as TextNode[];
              titleNodes.push(...found);
            }
            
            if (titleNodes.length > 0) {
              Logger.debug(`   🔗 [ESnippet] Найдено ${titleNodes.length} Sitelinks-Title`);
              
              for (let i = 0; i < Math.min(titleNodes.length, sitelinkTexts.length); i++) {
                await safeSetTextNode(titleNodes[i], sitelinkTexts[i]);
                Logger.debug(`   🔗 [ESnippet] Sitelinks-Title[${i}]: "${sitelinkTexts[i]}"`);
              }
            }
          }
        }
      } else {
        Logger.debug(`   ⚠️ [ESnippet] Контейнер Sitelinks не найден`);
      }
    }
    
    // --- ПРОМО-БЛОК (для промо-сниппетов) ---
    if (hasPromo) {
      const promoText = (row['#Promo'] || '').trim();
      if (promoText) {
        // Ищем текстовый слой для промо-текста
        const promoLayer = findTextLayerByName(instance, '#Promo') ||
                          findTextLayerByName(instance, 'InfoSection-Text') ||
                          findTextLayerByName(instance, 'PromoText');
        if (promoLayer) {
          await safeSetTextNode(promoLayer, promoText);
          Logger.debug(`   🎁 [ESnippet] Promo: "${promoText.substring(0, 40)}..."`);
        }
        
        // Также пробуем установить через property
        trySetProperty(instance, ['promoText', 'promo'], promoText, '#Promo');
      }
    }
    
    // --- isPromo (boolean) — промо-сниппет ---
    const isPromo = row['#isPromo'] === 'true';
    if (isPromo) {
      trySetProperty(instance, ['isPromo', 'promo', 'isAdv'], true, '#isPromo');
      Logger.debug(`   🎯 [ESnippet] isPromo=true (промо-сниппет)`);
    }
    
    Logger.debug(`   📦 [ESnippet] Пропсы: withReviews=${hasReviews}, withQuotes=${hasQuotes}, withDelivery=${hasDelivery}, withFintech=${hasFintech}, withAddress=${hasAddress}, withSitelinks=${hasSitelinks}, withPromo=${hasPromo}, withButton=${hasButton}, withMeta=${hasMeta}, withPrice=${hasPrice}`);
    Logger.debug(`   📝 [ESnippet] Тексты: title=${organicTitle?.substring(0, 30)}..., host=${organicHost}`);
    
    // --- Отключаем clipsContent для content__left ---
    // Это нужно чтобы контент не обрезался при переполнении
    const contentLeft = instance.findOne(n => n.name === 'content__left');
    if (contentLeft && contentLeft.type === 'FRAME' && !contentLeft.removed) {
      try {
        (contentLeft as FrameNode).clipsContent = false;
        Logger.debug(`   📐 [ESnippet] content__left.clipsContent = false`);
      } catch (e) {
        Logger.debug(`   ⚠️ [ESnippet] Не удалось отключить clipsContent для content__left`);
      }
    }
  }
}

// handleRatingReviewQuoteVisibility — REMOVED (deprecated, was no-op)
// Visibility now managed via withReviews/withQuotes on snippet components

/**
 * Обработка #QuoteText — заполнение текстового слоя с цитатой из отзыва
 * Ищет слой #QuoteText, #EQuote-Text или EQuote-Text внутри контейнера
 */
export async function handleQuoteText(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const quoteText = (row['#QuoteText'] || row['#EQuote-Text'] || '').trim();
  
  // Применяем текст цитаты, если он есть
  if (quoteText) {
    // Ищем текстовый слой для цитаты
    const quoteLayerNames = ['#QuoteText', '#EQuote-Text', 'EQuote-Text', 'Quote'];
    let textApplied = false;
    for (const name of quoteLayerNames) {
      const layer = findTextLayerByName(container, name);
      if (layer) {
        await safeSetTextNode(layer, quoteText);
        Logger.debug(`   💬 [QuoteText] Установлена цитата: "${quoteText.substring(0, 40)}..."`);
        textApplied = true;
        break;
      }
    }

    // Fallback: ищем через findFirstNodeByName
    if (!textApplied) {
      const quoteContainer = findFirstNodeByName(container, 'EQuote') ||
                             findFirstNodeByName(container, 'OrganicUgcReviews-QuoteWrapper');
      if (quoteContainer) {
        const textNode = findFirstTextByPredicate(quoteContainer, (t) => {
          const s = (t.characters || '').trim();
          // Ищем текст похожий на цитату (с кавычками или «)
          return s.includes('«') || s.includes('»') || s.includes('"') || s.length > 10;
        });
        if (textNode) {
          await safeSetTextNode(textNode, quoteText);
          Logger.debug(`   💬 [QuoteText] Fallback: цитата через EQuote: "${quoteText.substring(0, 40)}..."`);
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
  const layerNames = ['#EQuote-AuthorAvatar', 'EQuote-AuthorAvatar', '#QuoteImage', 'EQuote-AvatarWrapper'];
  let layer: SceneNode | null = null;
  
  for (const name of layerNames) {
    layer = findLayerDeep(sceneContainer, name);
    if (layer && 'fills' in layer) {
      break;
    }
    layer = null;
  }
  
  if (!layer) {
    // Fallback: ищем внутри EQuote или OrganicUgcReviews-QuoteWrapper
    const quoteWrapper = findLayerDeep(sceneContainer, 'EQuote') ||
                         findLayerDeep(sceneContainer, 'OrganicUgcReviews-QuoteWrapper');
    if (quoteWrapper) {
      // Ищем любой небольшой квадратный/круглый слой (аватар обычно маленький)
      const avatarCandidates = ['Avatar', 'Image', 'Photo'];
      for (const name of avatarCandidates) {
        layer = findLayerDeep(quoteWrapper, name);
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
  
  try {
    let normalizedUrl = avatarUrl;
    if (avatarUrl.startsWith('//')) {
      normalizedUrl = `https:${avatarUrl}`;
    }
    
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      Logger.debug(`   👤 [QuoteAvatar] ❌ URL без http(s)`);
      return;
    }
    
    const response = await fetch(normalizedUrl);
    if (!response.ok) {
      Logger.debug(`   👤 [QuoteAvatar] ❌ Ошибка загрузки: ${response.status}`);
      return;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const imageHash = figma.createImage(uint8Array).hash;
    
    const imagePaint: ImagePaint = {
      type: 'IMAGE',
      scaleMode: 'FILL', // FILL для аватарок (чтобы заполнить круг)
      imageHash: imageHash
    };
    (layer as GeometryMixin).fills = [imagePaint];
    Logger.debug(`   👤 [QuoteAvatar] ✅ Аватар применён к "${layer.name}"`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger.debug(`   👤 [QuoteAvatar] ❌ Ошибка: ${msg}`);
  }
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
  const pathBlock = findFirstNodeByName(container, 'Block / Snippet-staff / Path') ||
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
  const { container, row, instanceCache } = context;
  
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
  
  // Ищем вложенный EThumb instance — ОПТИМИЗИРОВАНО: instanceCache сначала
  let eThumbInstance: InstanceNode | null = null;
  
  if (instance.name.toLowerCase().includes('ethumb')) {
    eThumbInstance = instance;
  } else if (instanceCache) {
    // Используем кэш для поиска EThumb вместо deep traversal
    eThumbInstance = getCachedInstance(instanceCache, 'EThumb') || 
                     getCachedInstance(instanceCache, 'Thumb') || null;
  }
  
  // Fallback: deep traversal только если кэш не помог
  if (!eThumbInstance && 'findOne' in instance) {
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
 * Управление видимостью EcomMeta на основе наличия данных
 * 
 * EcomMeta содержит метаданные товара:
 * - Рейтинг (#ProductRating)
 * - Отзывы (#ReviewCount)  
 * - Барометр (#EPriceBarometer_View)
 * - Цена (#OrganicPrice)
 * 
 * Если ни одного из этих полей нет — скрываем EcomMeta целиком.
 * Если есть данные — показываем (для reprocessing).
 */
export function handleEcomMetaVisibility(context: HandlerContext): void {
  const { container, row, instanceCache } = context;
  
  if (!container || !row || !instanceCache) return;
  
  const containerName = 'name' in container ? container.name : '';
  
  // Применяется только к ESnippet
  if (containerName !== 'ESnippet' && containerName !== 'Snippet') return;
  
  // Поля, которые отвечают за содержимое EcomMeta
  const ecomMetaFields = [
    '#ProductRating',
    '#ReviewCount', 
    '#OrganicPrice',
    '#OldPrice',
    '#EPriceBarometer_View',
    '#ELabelGroup',
  ];
  
  // Проверяем наличие хотя бы одного непустого поля
  const hasData = ecomMetaFields.some(field => {
    const value = row[field as keyof CSVRow];
    return value !== undefined && value !== null && value !== '' && value !== 'false';
  });
  
  // Способ 1: через свойство withEcomMeta на контейнере (новые компоненты)
  if (container.type === 'INSTANCE' && !container.removed) {
    const propSet = trySetProperty(
      container as InstanceNode,
      ['withEcomMeta'],
      hasData,
      '#withEcomMeta'
    );
    if (propSet) {
      Logger.debug(`📦 [EcomMetaVisibility] withEcomMeta=${hasData} via property on "${containerName}"`);
      return; // Figma управляет видимостью через свойство — ничего больше не нужно
    }
  }
  
  // Способ 2: fallback — напрямую управляем visible (старые компоненты без withEcomMeta)
  const ecomMeta = instanceCache.groups.get('EcomMeta');
  
  if (!ecomMeta || ecomMeta.removed) {
    Logger.debug(`📦 [EcomMetaVisibility] EcomMeta не найден или удалён в "${containerName}"`);
    return;
  }
  
  Logger.debug(`📦 [EcomMetaVisibility] fallback: hasData=${hasData}, visible=${ecomMeta.visible}`);
  
  if (!hasData && ecomMeta.visible) {
    ecomMeta.visible = false;
    Logger.debug(`📦 [EcomMetaVisibility] Скрыт EcomMeta (нет данных)`);
    
    // Также скрываем всех детей, чтобы handleEmptyGroups потом не показал группу
    for (const child of ecomMeta.children) {
      if ('visible' in child && !child.removed) {
        (child as SceneNode).visible = false;
      }
    }
  } else if (hasData && !ecomMeta.visible) {
    ecomMeta.visible = true;
    Logger.debug(`📦 [EcomMetaVisibility] Показан EcomMeta (есть данные)`);
  }
}

/**
 * Управление видимостью "пустых" групп — FINAL handler
 * 
 * Автоматически скрывает группы, у которых все дети скрыты после обработки.
 * При повторной обработке показывает группы, если какой-то ребёнок стал видимым.
 * 
 * Алгоритм:
 * 1. Получаем все группы из кэша, отсортированные по глубине (глубокие первыми)
 * 2. Для каждой группы с подходящим именем проверяем видимость детей
 * 3. Если все дети скрыты → скрываем группу
 * 4. Если есть видимые дети, но группа скрыта → показываем группу
 * 
 * Обрабатываемые группы (по имени):
 * - EcomMeta, Meta, ESnippet-Meta
 * - Rating + Reviews, Rating + Review + Quote
 * - Sitelinks, Contacts, Promo, Price Block
 * - Любые группы с суффиксами: Group, Container, Wrapper, Block
 */
export function handleEmptyGroups(context: HandlerContext): void {
  const { container, instanceCache } = context;
  
  // ДИАГНОСТИКА: используем console.log вместо Logger.debug
  console.log(`📦 [EmptyGroups] ВЫЗВАН! container=${!!container}, instanceCache=${!!instanceCache}`);
  
  if (!container || !instanceCache) {
    console.log(`📦 [EmptyGroups] Пропуск: container=${!!container}, instanceCache=${!!instanceCache}`);
    return;
  }
  
  const containerName = 'name' in container ? container.name : 'unknown';
  console.log(`📦 [EmptyGroups] Начало обработки для контейнера "${containerName}"`);
  
  // Диагностика: выводим все группы в кэше
  const allGroupNames = Array.from(instanceCache.groups.keys());
  console.log(`📦 [EmptyGroups] Все группы в кэше (${allGroupNames.length}): ${allGroupNames.slice(0, 20).join(', ')}${allGroupNames.length > 20 ? '...' : ''}`);
  
  // Получаем группы, отсортированные по глубине (глубокие первыми — bottom-up)
  const groups = getGroupsSortedByDepth(instanceCache);
  
  if (groups.length === 0) {
    console.log(`📦 [EmptyGroups] Нет групп для обработки (getGroupsSortedByDepth вернул пустой массив)`);
    return;
  }
  
  console.log(`📦 [EmptyGroups] Групп для обработки: ${groups.length}`);
  
  let hiddenCount = 0;
  let shownCount = 0;
  
  for (const group of groups) {
    // Пропускаем удалённые группы
    if (group.removed) continue;
    
    // Проверяем, должна ли группа обрабатываться
    if (!shouldProcessGroupForEmptyCheck(group.name)) continue;
    
    // EcomMeta обрабатывается отдельным handler (handleEcomMetaVisibility)
    // Не трогаем его здесь, чтобы не переопределять решение
    if (group.name === 'EcomMeta') {
      console.log(`   📦 [EmptyGroups] Пропуск EcomMeta (обрабатывается отдельно)`);
      continue;
    }
    
    try {
      // Проверяем видимость детей
      // areAllChildrenHidden возвращает true для пустых групп (0 детей)
      const allHidden = areAllChildrenHidden(group);
      const hasVisible = hasAnyVisibleChild(group);
      
      console.log(`   📦 [EmptyGroups] Группа "${group.name}": children=${group.children.length}, allHidden=${allHidden}, hasVisible=${hasVisible}, visible=${group.visible}`);
      
      if (allHidden && group.visible) {
        // Все дети скрыты (или нет детей) → скрываем группу
        group.visible = false;
        hiddenCount++;
        console.log(`   📦 [EmptyGroups] Скрыта группа "${group.name}" (пустая или все дети скрыты)`);
      } else if (hasVisible && !group.visible) {
        // Есть видимые дети, но группа скрыта → показываем (reprocessing case)
        group.visible = true;
        shownCount++;
        console.log(`   📦 [EmptyGroups] Показана группа "${group.name}" (есть видимые дети)`);
      }
    } catch (e) {
      // Игнорируем ошибки (например, если группа защищена)
      console.log(`   ⚠️ [EmptyGroups] Ошибка обработки "${group.name}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  
  if (hiddenCount > 0 || shownCount > 0) {
    console.log(`📦 [EmptyGroups] Итого: скрыто ${hiddenCount}, показано ${shownCount} групп`);
  }
}

/**
 * @deprecated Используйте handleEmptyGroups вместо handleMetaVisibility
 * Оставлен для обратной совместимости
 */
export function handleMetaVisibility(context: HandlerContext): void {
  handleEmptyGroups(context);
}

/**
 * Обработка EProductSnippet — карточка товара в grid (EProductSnippet2)
 * Актуальные пропсы (2025-01): withDelivery, withButton, View, withBarometer
 * 
 * Данные:
 * - #OrganicTitle → organicTitle (string property) или текстовый слой
 * - #ShopName → EShopName.name (string property)
 * - #EDeliveryGroup → withDelivery (boolean)
 * - #BUTTON → withButton (boolean)
 * - #EMarketCheckoutLabel → View variant
 * - #EPriceBarometer_View → withBarometer (boolean)
 */
export async function handleEProductSnippet(context: HandlerContext): Promise<void> {
  const { container, row, instanceCache } = context;
  if (!container || !row) return;
  
  const containerName = (container && 'name' in container) ? String(container.name) : '';
  // EProductSnippet в Figma соответствует EProductSnippet2 в HTML
  if (containerName !== 'EProductSnippet' && containerName !== 'EProductSnippet2') return;
  
  Logger.debug(`   📦 [EProductSnippet] Обработка для "${row['#OrganicTitle']?.substring(0, 30)}..."`);
  
  if (container.type === 'INSTANCE' && !container.removed) {
    const instance = container as InstanceNode;
    
    // Диагностика: выводим все доступные свойства компонента
    const props = instance.componentProperties;
    const propNames = Object.keys(props);
    Logger.debug(`   📋 [EProductSnippet] Доступные свойства (${propNames.length}): ${propNames.slice(0, 10).join(', ')}${propNames.length > 10 ? '...' : ''}`);
    
    // === Boolean свойства ===
    
    // withDelivery (boolean) — показать доставку
    const hasDeliveryGroup = row['#EDeliveryGroup'] === 'true';
    const deliverySet = trySetProperty(instance, ['withDelivery', 'Delivery'], hasDeliveryGroup, '#withDelivery');
    Logger.debug(`   📦 [EProductSnippet] withDelivery=${hasDeliveryGroup}, result=${deliverySet}`);
    
    // withButton (boolean) — показать кнопку
    // EProductSnippet2: кнопка показывается если есть EMarketCheckoutLabel
    const hasCheckout = row['#EMarketCheckoutLabel'] === 'true' || row['#BUTTON'] === 'true';
    const buttonSet = trySetProperty(instance, ['withButton', 'Button'], hasCheckout, '#withButton');
    Logger.debug(`   📦 [EProductSnippet] withButton=${hasCheckout}, result=${buttonSet}`);
    
    // ПРИМЕЧАНИЕ: withBarometer — это свойство на EPriceGroup, а не на EProductSnippet
    // Устанавливается в handleEPriceGroup, здесь его трогать не нужно
    
    // === String свойства ===
    
    // organicTitle (string) — название товара
    const organicTitle = (row['#OrganicTitle'] || '').trim();
    if (organicTitle) {
      const titleSet = trySetProperty(instance, ['organicTitle', 'title', 'Title'], organicTitle, '#OrganicTitle');
      if (!titleSet) {
        // Fallback: ищем текстовый слой
        const titleLayer = findTextLayerByName(instance, '#OrganicTitle') || 
                          findTextLayerByName(instance, 'EProductSnippet2-Title');
        if (titleLayer) {
          await safeSetTextNode(titleLayer, organicTitle);
          Logger.debug(`   📝 [EProductSnippet] Title через текстовый слой: "${organicTitle.substring(0, 30)}..."`);
        }
      } else {
        Logger.debug(`   📝 [EProductSnippet] organicTitle="${organicTitle.substring(0, 30)}..." result=${titleSet}`);
      }
    }
    
    // === Вложенные компоненты ===
    
    // EShopName.name (string) — название магазина
    const shopName = (row['#ShopName'] || '').trim();
    if (shopName && instanceCache) {
      const shopNameInstance = getCachedInstance(instanceCache, 'EShopName');
      if (shopNameInstance) {
        const nameSet = trySetProperty(shopNameInstance, ['name'], shopName, '#ShopName');
        Logger.debug(`   🏪 [EProductSnippet] ShopName: "${shopName}", result=${nameSet}`);
      } else {
        // Fallback: ищем текстовый слой
        const shopLayer = findTextLayerByName(instance, '#ShopName') ||
                         findFirstNodeByName(instance, 'EShopName');
        if (shopLayer) {
          const textNode = findFirstTextByPredicate(shopLayer, () => true);
          if (textNode) {
            await safeSetTextNode(textNode, shopName);
            Logger.debug(`   🏪 [EProductSnippet] ShopName через текстовый слой: "${shopName}"`);
          }
        }
      }
    }
    
    Logger.debug(`   📦 [EProductSnippet] Пропсы: withDelivery=${hasDeliveryGroup}, withButton=${hasCheckout}, title="${organicTitle?.substring(0, 20)}...", shop="${shopName}"`);
  }
}

