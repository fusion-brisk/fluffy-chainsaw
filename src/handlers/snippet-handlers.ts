/**
 * Обработчики для сниппетов
 *
 * Property mapping (handleEOfferItem, handleEShopItem, handleESnippetProps, handleEProductSnippet)
 * заменён schema engine — см. src/schema/*.ts
 *
 * Здесь остаются: text filling, fallbacks, visibility, image handling
 */

import { Logger } from '../logger';
import { trySetProperty } from '../property-utils';
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

  // 0) Set value on Line instances inside EReviewsLabel (new structure: 2 × Line with value property)
  if (reviewsLabelGroup && reviewsLabelGroup.type === 'INSTANCE') {
    const inst = reviewsLabelGroup as InstanceNode;
    if ('findAll' in inst) {
      const lineInstances = inst.findAll((n: SceneNode) =>
        n.type === 'INSTANCE' && n.name === 'Line'
      ) as InstanceNode[];

      let linesSet = 0;
      // First Line = rating, Second Line = reviews text
      if (ratingDisplay && lineInstances.length >= 1) {
        try {
          lineInstances[0].setProperties({ value: ratingDisplay });
          linesSet++;
          Logger.debug(`   ⭐ [EReviewsLabel] Line[0].value set: ${ratingDisplay}`);
        } catch (_e) { /* fallback below */ }
      }
      if (reviewsTextRaw && lineInstances.length >= 2) {
        try {
          lineInstances[1].setProperties({ value: reviewsTextRaw });
          linesSet++;
          Logger.debug(`   📝 [EReviewsLabel] Line[1].value set: ${reviewsTextRaw}`);
        } catch (_e) { /* fallback below */ }
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

// handleEOfferItem — DELETED (replaced by schema engine, see eoffer-item.ts)
// handleEShopItem — DELETED (replaced by schema engine, see eshop-item.ts)
// handleESnippetProps — DELETED (replaced by schema engine, see esnippet.ts)

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
    let textApplied = false;

    // Strategy 0: Set value on Line instance inside Line / EQuote
    const eQuoteWrapper = findFirstNodeByName(container, 'Line / EQuote');
    if (eQuoteWrapper && eQuoteWrapper.type === 'INSTANCE') {
      // Line / EQuote contains a nested Line instance with value property
      const innerLine = (eQuoteWrapper as InstanceNode).findOne((n: SceneNode) =>
        n.type === 'INSTANCE' && n.name === 'Line'
      ) as InstanceNode | null;
      if (innerLine) {
        try {
          innerLine.setProperties({ value: quoteText });
          textApplied = true;
          Logger.debug(`   💬 [QuoteText] Line.value set: "${quoteText.substring(0, 40)}..."`);
        } catch (_e) { /* fallback below */ }
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
      const quoteContainer = findFirstNodeByName(container, 'EQuote') ||
                             findFirstNodeByName(container, 'OrganicUgcReviews-QuoteWrapper');
      if (quoteContainer) {
        const textNode = findFirstTextByPredicate(quoteContainer, (t) => {
          const s = (t.characters || '').trim();
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
  
  if (!container || !instanceCache) return;

  const containerName = 'name' in container ? container.name : 'unknown';
  Logger.debug(`📦 [EmptyGroups] Начало обработки для "${containerName}"`);

  // Получаем группы, отсортированные по глубине (глубокие первыми — bottom-up)
  const groups = getGroupsSortedByDepth(instanceCache);
  if (groups.length === 0) return;
  
  let hiddenCount = 0;
  let shownCount = 0;
  
  for (const group of groups) {
    // Пропускаем удалённые группы
    if (group.removed) continue;
    
    // Проверяем, должна ли группа обрабатываться
    if (!shouldProcessGroupForEmptyCheck(group.name)) continue;
    
    // EcomMeta обрабатывается отдельным handler (handleEcomMetaVisibility)
    if (group.name === 'EcomMeta') continue;

    try {
      const allHidden = areAllChildrenHidden(group);
      const hasVisible = hasAnyVisibleChild(group);

      if (allHidden && group.visible) {
        group.visible = false;
        hiddenCount++;
      } else if (hasVisible && !group.visible) {
        group.visible = true;
        shownCount++;
      }
    } catch (_e) {
      // Игнорируем ошибки (группа может быть защищена)
    }
  }

  if (hiddenCount > 0 || shownCount > 0) {
    Logger.debug(`📦 [EmptyGroups] Скрыто ${hiddenCount}, показано ${shownCount} групп`);
  }
}

// handleMetaVisibility — DELETED (deprecated wrapper for handleEmptyGroups)
// handleEProductSnippet — DELETED (replaced by schema engine, see eproduct-snippet.ts)
