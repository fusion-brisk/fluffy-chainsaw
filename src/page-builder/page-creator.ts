/**
 * Page Creator — создание структуры страницы в Figma
 * 
 * Создаёт Auto Layout фреймы с инстансами компонентов
 * и заполняет их данными
 */

import { Logger } from '../logger';
import { handlerRegistry, HandlerContext } from '../component-handlers';
import { buildInstanceCache } from '../utils/instance-cache';
import { findTextNode } from '../utils/node-search';
import { 
  PageElement, 
  PageStructure, 
  PageCreationOptions, 
  PageCreationResult,
  PageCreationError,
  SnippetType,
  GroupType
} from './types';
import { 
  getComponentConfig, 
  getContainerConfig,
  isGroupType,
  isLayoutType,
  isContainerType,
  SNIPPET_COMPONENT_MAP,
  GROUP_COMPONENT_MAP,
  LAYOUT_COMPONENT_MAP,
  CONTAINER_CONFIG_MAP,
  FILTER_COMPONENTS
} from './component-map';
import { parsePageStructure } from './structure-parser';
import { buildPageStructure, sortContentNodes } from './structure-builder';
import { StructureNode, ContainerType, SerpPageStructure, ContainerConfig } from './types';

/**
 * Дефолтные настройки создания страницы
 */
const DEFAULT_OPTIONS: Required<PageCreationOptions> = {
  width: 1280,
  itemSpacing: 16,
  padding: {
    top: 24,
    right: 24,
    bottom: 24,
    left: 24,
  },
  frameName: 'SERP Page',
  platform: 'desktop',
};

/**
 * Кэш импортированных компонентов
 * Ключ — component key, значение — ComponentNode
 */
const componentCache = new Map<string, ComponentNode>();

/**
 * Очистить кэш компонентов
 */
export function clearComponentCache(): void {
  componentCache.clear();
}

/**
 * Импортировать компонент из библиотеки с кэшированием
 */
async function importComponent(key: string): Promise<ComponentNode | null> {
  if (!key) {
    Logger.warn('[PageCreator] Пустой ключ компонента');
    return null;
  }
  
  // Проверяем кэш
  if (componentCache.has(key)) {
    return componentCache.get(key)!;
  }
  
  try {
    const component = await figma.importComponentByKeyAsync(key);
    componentCache.set(key, component);
    Logger.debug(`[PageCreator] Импортирован компонент: ${component.name} (key=${key})`);
    return component;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger.error(`[PageCreator] Ошибка импорта компонента (key=${key}): ${msg}`);
    return null;
  }
}

/**
 * Создать инстанс компонента для элемента страницы
 */
async function createInstanceForElement(
  element: PageElement,
  platform: 'desktop' | 'touch'
): Promise<InstanceNode | null> {
  const config = getComponentConfig(element.type);
  
  if (!config) {
    Logger.warn(`[PageCreator] Нет конфигурации для типа: ${element.type}`);
    return null;
  }
  
  if (!config.key) {
    Logger.warn(`[PageCreator] Нет ключа компонента для типа: ${element.type}`);
    return null;
  }
  
  // Для touch-платформы используем keyTouch если он существует
  const componentKey = (platform === 'touch' && (config as any).keyTouch) 
    ? (config as any).keyTouch 
    : config.key;
  
  // Импортируем компонент
  const component = await importComponent(componentKey);
  if (!component) {
    return null;
  }
  
  // Создаём инстанс
  const instance = component.createInstance();
  
  // Применяем дефолтные variant properties (без Platform — уже в компоненте)
  if (config.defaultVariant) {
    try {
      const platformValue = platform === 'desktop' ? 'Desktop' : 'Touch';
      // Копируем defaultVariant но без Platform
      const { Platform: _platform, ...restProps } = config.defaultVariant as Record<string, unknown>;
      instance.setProperties(restProps as Record<string, string | boolean | number>);
      console.log(`[PageCreator] ✅ ${element.type}: Platform=${platformValue} (из компонента)`);
    } catch (e) {
      Logger.debug(`[PageCreator] Не удалось установить properties: ${e}`);
    }
  }
  
  return instance;
}

/**
 * Применить данные к инстансу через существующие handlers
 */
async function applyDataToInstance(
  instance: InstanceNode,
  element: PageElement
): Promise<void> {
  if (!element.data || Object.keys(element.data).length === 0) {
    Logger.debug(`[PageCreator] Нет данных для элемента ${element.id}`);
    return;
  }
  
  try {
    // Строим кэш инстанса для handlers
    const instanceCache = buildInstanceCache(instance);
    
    // Создаём контекст для handlers
    const context: HandlerContext = {
      container: instance,
      containerKey: instance.id,
      row: element.data,
      instanceCache,
    };
    
    // Выполняем все handlers
    const results = await handlerRegistry.executeAll(context);
    
    // Логируем ошибки
    for (const res of results) {
      if (!res.success) {
        Logger.warn(`[PageCreator] Handler ${res.handlerName} ошибка: ${res.error}`);
      }
    }
    
    Logger.debug(`[PageCreator] Применены данные к ${element.type} (${instance.name})`);
  } catch (e) {
    Logger.error(`[PageCreator] Ошибка применения данных:`, e);
  }
}

/**
 * Создать группу с вложенными элементами
 */
async function createGroupWithChildren(
  element: PageElement,
  platform: 'desktop' | 'touch'
): Promise<InstanceNode | null> {
  const config = getComponentConfig(element.type);
  
  if (!config || !config.isGroup) {
    Logger.warn(`[PageCreator] Тип ${element.type} не является группой`);
    return null;
  }
  
  // Создаём инстанс группы
  const groupInstance = await createInstanceForElement(element, platform);
  if (!groupInstance) {
    return null;
  }
  
  // Устанавливаем количество видимых элементов
  const childrenCount = element.children?.length || 0;
  const visibleCount = Math.min(childrenCount, config.maxItems || childrenCount);
  
  if (config.itemCountProperty) {
    try {
      groupInstance.setProperties({
        [config.itemCountProperty]: String(visibleCount),
      });
    } catch (e) {
      Logger.debug(`[PageCreator] Не удалось установить ${config.itemCountProperty}: ${e}`);
    }
  }
  
  // TODO: Заполнить вложенные слоты данными из children
  // Это зависит от структуры компонента в библиотеке
  // Возможные подходы:
  // 1. Найти слоты по имени (Item 1, Item 2, ...)
  // 2. Использовать exposed instances
  // 3. Заполнить через component properties
  
  if (element.children) {
    Logger.debug(`[PageCreator] Группа ${element.type} с ${element.children.length} детьми`);
    
    // Пока применяем данные первого ребёнка к самой группе
    // (как fallback, пока не знаем структуру групповых компонентов)
    if (element.children.length > 0) {
      await applyDataToInstance(groupInstance, element.children[0]);
    }
  }
  
  return groupInstance;
}

/**
 * Создать страницу из структуры
 */
export async function createPageFromStructure(
  structure: PageStructure,
  options: PageCreationOptions = {}
): Promise<PageCreationResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const errors: PageCreationError[] = [];
  let createdCount = 0;
  
  Logger.info(`[PageCreator] Создание страницы: ${structure.elements.length} элементов`);
  
  // 1. Создаём главный фрейм страницы
  const pageFrame = figma.createFrame();
  pageFrame.name = opts.frameName;
  pageFrame.layoutMode = 'VERTICAL';
  pageFrame.primaryAxisSizingMode = 'AUTO';
  pageFrame.counterAxisSizingMode = 'FIXED';
  pageFrame.resize(opts.width, 100); // Высота автоматическая
  pageFrame.itemSpacing = opts.itemSpacing;
  pageFrame.paddingTop = opts.padding.top ?? 24;
  pageFrame.paddingRight = opts.padding.right ?? 24;
  pageFrame.paddingBottom = opts.padding.bottom ?? 24;
  pageFrame.paddingLeft = opts.padding.left ?? 24;
  
  // Позиционируем фрейм
  pageFrame.x = figma.viewport.center.x - opts.width / 2;
  pageFrame.y = figma.viewport.center.y;
  
  // 2. Создаём элементы
  for (const element of structure.elements) {
    try {
      let instance: InstanceNode | null = null;
      
      if (isGroupType(element.type)) {
        // Создаём группу
        instance = await createGroupWithChildren(element, opts.platform);
      } else {
        // Создаём одиночный сниппет
        instance = await createInstanceForElement(element, opts.platform);
        
        if (instance) {
          // Применяем данные
          await applyDataToInstance(instance, element);
        }
      }
      
      if (instance) {
        pageFrame.appendChild(instance);
        createdCount++;
        Logger.verbose(`[PageCreator] Создан ${element.type} (${createdCount}/${structure.elements.length})`);
      } else {
        errors.push({
          elementId: element.id,
          elementType: element.type,
          message: 'Не удалось создать инстанс',
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({
        elementId: element.id,
        elementType: element.type,
        message: msg,
        stack: e instanceof Error ? e.stack : undefined,
      });
      Logger.error(`[PageCreator] Ошибка создания ${element.type}:`, e);
    }
  }
  
  // 3. Фокусируемся на созданном фрейме
  figma.currentPage.selection = [pageFrame];
  figma.viewport.scrollAndZoomIntoView([pageFrame]);
  
  const creationTime = Date.now() - startTime;
  
  Logger.info(`[PageCreator] Страница создана: ${createdCount} элементов за ${creationTime}ms`);
  if (errors.length > 0) {
    Logger.warn(`[PageCreator] Ошибок: ${errors.length}`);
  }
  
  return {
    success: errors.length === 0 || createdCount > 0,
    frame: pageFrame,
    createdCount,
    errors: errors.map(e => `[${e.elementType}] ${e.message}`),
    creationTime,
  };
}

/**
 * Определить тип сниппета по данным row
 * Парсер устанавливает поле #SnippetType
 */
function detectSnippetType(row: import('../types').CSVRow): SnippetType {
  // Парсер snippet-parser.ts устанавливает #SnippetType
  const type = row['#SnippetType'] || '';
  
  // Прямое совпадение с известными типами
  if (type === 'EOfferItem') return 'EOfferItem';
  if (type === 'EProductSnippet2') return 'EProductSnippet2';
  if (type === 'EShopItem') return 'EShopItem';
  if (type === 'Organic') return 'Organic';
  if (type === 'ESnippet') return 'ESnippet';
  
  // Fallback по подстроке
  if (type.includes('Offer')) return 'EOfferItem';
  if (type.includes('Shop')) return 'EShopItem';
  if (type.includes('Product')) return 'EProductSnippet2';
  
  // По умолчанию — ESnippet (основной тип)
  Logger.debug(`[PageCreator] Неизвестный тип сниппета: "${type}", используем ESnippet`);
  return 'ESnippet';
}

/**
 * Создать страницу из массива rows (без DOM парсинга)
 * Каждый row становится отдельным элементом
 */
export async function createPageFromRows(
  rows: import('../types').CSVRow[],
  options: PageCreationOptions = {}
): Promise<PageCreationResult> {
  const startTime = Date.now();
  
  Logger.info(`[PageCreator] Создание страницы из ${rows.length} rows`);
  
  // Строим структуру из rows
  const elements: PageElement[] = rows.map((row, index) => ({
    id: `row-${index}`,
    type: detectSnippetType(row),
    data: row,
    order: index,
    depth: 0,
  }));
  
  // Определяем query из первого row (если есть)
  const query = rows[0]?.query || rows[0]?.title || '';
  
  const structure: PageStructure = {
    elements,
    meta: {
      query: query ? String(query).substring(0, 50) : undefined,
      platform: options.platform || 'desktop',
      totalResults: rows.length,
      source: 'rows',
    },
    stats: {
      totalElements: elements.length,
      byType: elements.reduce((acc, el) => {
        acc[el.type] = (acc[el.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      groupCount: 0,
      parseTime: 0,
    },
  };
  
  // Добавляем query к имени фрейма
  const frameName = structure.meta.query 
    ? `SERP: ${structure.meta.query}`
    : options.frameName || DEFAULT_OPTIONS.frameName;
  
  return createPageFromStructure(structure, {
    ...options,
    frameName,
    platform: structure.meta.platform,
  });
}

// ============================================================================
// CONTAINER CREATION
// ============================================================================

/**
 * Создать Auto Layout фрейм-контейнер
 */
function createContainerFrame(config: ContainerConfig): FrameNode {
  const frame = figma.createFrame();
  frame.name = config.name;
  frame.fills = [];
  
  // Layout mode
  if (config.layoutMode === 'WRAP') {
    frame.layoutMode = 'HORIZONTAL';
    frame.layoutWrap = 'WRAP';
  } else {
    frame.layoutMode = config.layoutMode;
  }
  
  // Sizing
  frame.primaryAxisSizingMode = config.height === 'HUG' ? 'AUTO' : 'FIXED';
  frame.counterAxisSizingMode = config.width === 'FILL' ? 'AUTO' : 'FIXED';
  
  if (typeof config.width === 'number') {
    frame.resize(config.width, 100);
  }
  if (typeof config.height === 'number') {
    frame.resize(frame.width, config.height);
  }
  
  // Spacing
  frame.itemSpacing = config.itemSpacing ?? 0;
  if (config.counterAxisSpacing !== undefined) {
    frame.counterAxisSpacing = config.counterAxisSpacing;
  }
  
  // Padding
  frame.paddingTop = config.padding?.top ?? 0;
  frame.paddingRight = config.padding?.right ?? 0;
  frame.paddingBottom = config.padding?.bottom ?? 0;
  frame.paddingLeft = config.padding?.left ?? 0;
  
  return frame;
}

/**
 * Найти слой изображения внутри контейнера
 */
function findImageLayer(container: SceneNode, names: string[]): SceneNode | null {
  if (!('children' in container)) return null;
  
  for (const name of names) {
    const found = findLayerRecursive(container, name);
    if (found) return found;
  }
  return null;
}

function findLayerRecursive(node: SceneNode, name: string): SceneNode | null {
  if (node.name === name) return node;
  if (!('children' in node)) return null;
  
  for (const child of node.children) {
    const found = findLayerRecursive(child, name);
    if (found) return found;
  }
  return null;
}

/**
 * Загружает изображение по URL и применяет к слою
 */
async function loadAndApplyImage(layer: SceneNode, url: string, logPrefix: string): Promise<boolean> {
  try {
    let normalizedUrl = url;
    if (url.startsWith('//')) {
      normalizedUrl = `https:${url}`;
    }

    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      console.log(`${logPrefix} ❌ URL без http(s): ${normalizedUrl.substring(0, 60)}`);
      return false;
    }

    console.log(`${logPrefix} Загрузка: ${normalizedUrl.substring(0, 60)}...`);
    const response = await fetch(normalizedUrl);
    console.log(`${logPrefix} Response: ${response.status} ${response.ok ? 'OK' : 'FAIL'}`);

    if (!response.ok) {
      console.log(`${logPrefix} ❌ Ошибка загрузки: ${response.status}`);
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`${logPrefix} Получено ${arrayBuffer.byteLength} bytes`);

    const uint8Array = new Uint8Array(arrayBuffer);
    const image = figma.createImage(uint8Array);
    console.log(`${logPrefix} Image hash: ${image.hash}`);

    if ('fills' in layer) {
      const imagePaint: ImagePaint = {
        type: 'IMAGE',
        scaleMode: 'FIT',
        imageHash: image.hash
      };
      (layer as GeometryMixin).fills = [imagePaint];
      console.log(`${logPrefix} ✅ Изображение применено!`);
      return true;
    } else {
      console.log(`${logPrefix} ❌ Слой не поддерживает fills`);
      return false;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${logPrefix} ❌ ОШИБКА: ${msg}`);
    return false;
  }
}

/**
 * Применить изображения к сниппету
 * Поддерживает как одиночное изображение, так и EThumbGroup (3 картинки)
 */
async function applySnippetImages(instance: InstanceNode, row: Record<string, string | undefined>): Promise<void> {
  const imageType = row['#imageType'] || '';
  const image1 = row['#Image1'] || '';
  const image2 = row['#Image2'] || '';
  const image3 = row['#Image3'] || '';
  
  // Если есть EThumbGroup с несколькими картинками
  if (imageType === 'EThumbGroup' && image2) {
    console.log(`[applySnippetImages] EThumbGroup: применяем ${image1 ? '1' : '0'}+${image2 ? '1' : '0'}+${image3 ? '1' : '0'} картинок`);
    
    const imageSlots = [
      { names: ['#Image1', 'Image1', 'EThumbGroup-Main'], url: image1 },
      { names: ['#Image2', 'Image2', 'EThumbGroup-Item_topRight'], url: image2 },
      { names: ['#Image3', 'Image3', 'EThumbGroup-Item_bottomRight'], url: image3 }
    ];
    
    // Параллельная загрузка всех изображений
    const promises = imageSlots.map(async (slot, idx) => {
      if (!slot.url || slot.url.trim() === '') return;
      
      let layer: SceneNode | null = null;
      for (const name of slot.names) {
        layer = findImageLayer(instance, [name]);
        if (layer) break;
      }
      
      if (!layer) {
        console.log(`[applySnippetImages] ⚠️ Image${idx + 1}: слой не найден (пробовал: ${slot.names.join(', ')})`);
        return;
      }
      
      console.log(`[applySnippetImages] Image${idx + 1}: найден слой "${layer.name}"`);
      await loadAndApplyImage(layer, slot.url, `[applySnippetImages] Image${idx + 1}:`);
    });
    
    await Promise.all(promises);
    return;
  }
  
  // Одиночное изображение (стандартный путь)
  const imageUrl = row['#OrganicImage'] || row['#ThumbImage'] || row['#Image1'] || '';

  if (!imageUrl || imageUrl.trim() === '') {
    console.log(`[applySnippetImages] Нет URL изображения`);
    return;
  }

  console.log(`[applySnippetImages] URL: "${imageUrl.substring(0, 60)}..."`);

  // Ищем слой изображения
  const layerNames = ['#OrganicImage', '#ThumbImage', 'Image Ratio', 'EThumb-Image', '#Image', '#Image1'];
  const layer = findImageLayer(instance, layerNames);

  if (!layer) {
    console.log(`[applySnippetImages] ❌ Слой НЕ найден (пробовал: ${layerNames.join(', ')})`);
    // Логируем все дочерние элементы для отладки
    if ('children' in instance) {
      const childNames = (instance.children as readonly SceneNode[]).slice(0, 10).map(c => c.name);
      console.log(`[applySnippetImages] Дочерние: ${childNames.join(', ')}`);
    }
    return;
  }

  console.log(`[applySnippetImages] ✅ Найден слой: "${layer.name}"`);
  await loadAndApplyImage(layer, imageUrl, '[applySnippetImages]');
}

/**
 * Применить favicon к инстансу сниппета
 */
async function applyFavicon(instance: InstanceNode, row: Record<string, string | undefined>): Promise<void> {
  const faviconUrl = row['#FaviconImage'] || '';

  if (!faviconUrl || faviconUrl.trim() === '') {
    console.log(`[applyFavicon] Нет URL фавиконки`);
    return;
  }

  console.log(`[applyFavicon] URL: "${faviconUrl.substring(0, 60)}..."`);

  // Ищем слой фавиконки
  const layerNames = ['#FaviconImage', '#Favicon', 'Favicon', 'favicon', 'EFavicon', 'EShopName/#Favicon'];
  const layer = findImageLayer(instance, layerNames);

  if (!layer) {
    console.log(`[applyFavicon] ❌ Слой НЕ найден (пробовал: ${layerNames.join(', ')})`);
    return;
  }

  console.log(`[applyFavicon] ✅ Найден слой: "${layer.name}"`);

  try {
    // Обработка data: URL (base64 изображение)
    if (faviconUrl.startsWith('data:')) {
      console.log(`[applyFavicon] Обработка data: URL`);
      
      // Извлекаем base64 часть
      const matches = faviconUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
      if (!matches || !matches[1]) {
        console.log(`[applyFavicon] ❌ Некорректный data: URL`);
        return;
      }
      
      // Декодируем base64 в Uint8Array
      const base64 = matches[1];
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      console.log(`[applyFavicon] Decoded ${bytes.length} bytes from base64`);
      
      const image = figma.createImage(bytes);
      console.log(`[applyFavicon] Image hash: ${image.hash}`);

      if ('fills' in layer) {
        const imagePaint: ImagePaint = {
          type: 'IMAGE',
          scaleMode: 'FIT',
          imageHash: image.hash
        };
        (layer as GeometryMixin).fills = [imagePaint];
        console.log(`[applyFavicon] ✅ Фавиконка (data:) применена!`);
      }
      return;
    }
    
    // Нормализация URL
    let normalizedUrl = faviconUrl;
    if (faviconUrl.startsWith('//')) {
      normalizedUrl = `https:${faviconUrl}`;
    }

    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      console.log(`[applyFavicon] ❌ URL без http(s): ${normalizedUrl.substring(0, 60)}`);
      return;
    }

    console.log(`[applyFavicon] Загрузка: ${normalizedUrl.substring(0, 60)}...`);
    const response = await fetch(normalizedUrl);
    console.log(`[applyFavicon] Response: ${response.status} ${response.ok ? 'OK' : 'FAIL'}`);

    if (!response.ok) {
      console.log(`[applyFavicon] ❌ Ошибка загрузки: ${response.status}`);
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`[applyFavicon] Получено ${arrayBuffer.byteLength} bytes`);

    const uint8Array = new Uint8Array(arrayBuffer);
    const image = figma.createImage(uint8Array);
    console.log(`[applyFavicon] Image hash: ${image.hash}`);

    if ('fills' in layer) {
      const imagePaint: ImagePaint = {
        type: 'IMAGE',
        scaleMode: 'FIT',
        imageHash: image.hash
      };
      (layer as GeometryMixin).fills = [imagePaint];
      console.log(`[applyFavicon] ✅ Фавиконка применена!`);
    } else {
      console.log(`[applyFavicon] ❌ Слой не поддерживает fills`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[applyFavicon] ❌ ОШИБКА: ${msg}`);
  }
}

/**
 * Применить аватар автора цитаты к инстансу сниппета
 */
async function applyQuoteAvatar(instance: InstanceNode, row: Record<string, string | undefined>): Promise<void> {
  const avatarUrl = row['#EQuote-AuthorAvatar'] || row['#QuoteImage'] || '';

  if (!avatarUrl || avatarUrl.trim() === '') {
    return; // Нет аватара — ничего не делаем (это нормально)
  }

  console.log(`[applyQuoteAvatar] URL: "${avatarUrl.substring(0, 60)}..."`);

  // Ищем слой аватара
  const layerNames = ['#EQuote-AuthorAvatar', 'EQuote-AuthorAvatar', '#QuoteImage', 'EQuote-AvatarWrapper'];
  const layer = findImageLayer(instance, layerNames);

  if (!layer) {
    console.log(`[applyQuoteAvatar] ⚠️ Слой не найден (пробовал: ${layerNames.join(', ')})`);
    return;
  }

  console.log(`[applyQuoteAvatar] ✅ Найден слой: "${layer.name}"`);

  try {
    let normalizedUrl = avatarUrl;
    if (avatarUrl.startsWith('//')) {
      normalizedUrl = `https:${avatarUrl}`;
    }

    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      console.log(`[applyQuoteAvatar] ❌ URL без http(s)`);
      return;
    }

    console.log(`[applyQuoteAvatar] Загрузка: ${normalizedUrl.substring(0, 60)}...`);
    const response = await fetch(normalizedUrl);
    console.log(`[applyQuoteAvatar] Response: ${response.status} ${response.ok ? 'OK' : 'FAIL'}`);

    if (!response.ok) {
      console.log(`[applyQuoteAvatar] ❌ Ошибка загрузки: ${response.status}`);
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`[applyQuoteAvatar] Получено ${arrayBuffer.byteLength} bytes`);

    const uint8Array = new Uint8Array(arrayBuffer);
    const image = figma.createImage(uint8Array);
    console.log(`[applyQuoteAvatar] Image hash: ${image.hash}`);

    if ('fills' in layer) {
      const imagePaint: ImagePaint = {
        type: 'IMAGE',
        scaleMode: 'FILL', // FILL для аватарок (заполняет круг)
        imageHash: image.hash
      };
      (layer as GeometryMixin).fills = [imagePaint];
      console.log(`[applyQuoteAvatar] ✅ Аватар применён!`);
    } else {
      console.log(`[applyQuoteAvatar] ❌ Слой не поддерживает fills`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[applyQuoteAvatar] ❌ ОШИБКА: ${msg}`);
  }
}

/**
 * Создать инстанс сниппета из StructureNode
 */
async function createSnippetInstance(
  node: StructureNode,
  platform: 'desktop' | 'touch',
  parentContainerType?: ContainerType
): Promise<InstanceNode | null> {
  let config = getComponentConfig(node.type as SnippetType);
  let actualType = node.type;

  // Fallback: если нет ключа — используем ESnippet для органических сниппетов
  if (!config || !config.key) {
    if (node.type === 'Organic' || node.type === 'Organic_withOfferInfo') {
      config = getComponentConfig('ESnippet');
      actualType = 'ESnippet';
      Logger.debug(`[PageCreator] Fallback: ${node.type} → ESnippet`);
    } else {
      Logger.warn(`[PageCreator] Нет ключа для типа: ${node.type}`);
      return null;
    }
  }

  if (!config || !config.key) {
    Logger.warn(`[PageCreator] Нет ключа для типа: ${node.type} (и fallback не сработал)`);
    return null;
  }

  // Для touch-платформы используем keyTouch если он существует
  const componentKey = (platform === 'touch' && (config as any).keyTouch)
    ? (config as any).keyTouch
    : config.key;

  console.log(`[PageCreator] ${node.type}: platform=${platform}, key=${componentKey.substring(0, 16)}...`);

  const component = await importComponent(componentKey);
  if (!component) {
    return null;
  }

  const instance = component.createInstance();

  // Принудительно устанавливаем имя для handlers
  instance.name = config.name;

  // Platform value для логов
  const platformValue = platform === 'desktop' ? 'Desktop' : 'Touch';

  // Применяем variant properties (без Platform — мы уже импортировали нужный вариант)
  if (config.defaultVariant) {
    try {
      // Копируем defaultVariant но без Platform (уже в компоненте правильный)
      const { Platform: _platform, ...restProps } = config.defaultVariant as Record<string, unknown>;
      
      // Для EProductSnippet2 внутри AdvProductGallery — применяем View=AdvGallery
      if (node.type === 'EProductSnippet2' && parentContainerType === 'AdvProductGallery') {
        restProps['View'] = 'AdvGallery';
        console.log(`[PageCreator] 🎯 ${node.type}: View=AdvGallery (родитель AdvProductGallery)`);
      }
      
      instance.setProperties(restProps as Record<string, string | boolean | number>);
      console.log(`[PageCreator] ✅ ${node.type}: Platform=${platformValue} (из компонента)`);
    } catch (e) {
      console.log(`[PageCreator] ❌ ${node.type} setProperties error: ${e}`);
    }
  } else if (node.type === 'EProductSnippet2' && parentContainerType === 'AdvProductGallery') {
    // Даже если нет defaultVariant — устанавливаем View=AdvGallery
    try {
      instance.setProperties({ 'View': 'AdvGallery' });
      console.log(`[PageCreator] 🎯 ${node.type}: View=AdvGallery (родитель AdvProductGallery, no defaultVariant)`);
    } catch (e) {
      console.log(`[PageCreator] ❌ ${node.type} View=AdvGallery error: ${e}`);
    }
  }
  
  // Логируем данные для отладки
  if (node.data) {
    const dataKeys = Object.keys(node.data).filter(k => node.data && node.data[k]);
    console.log(`[PageCreator] ${node.type} данные: ${dataKeys.join(', ')}`);
    // Логируем URL изображения отдельно
    const imgUrl = node.data['#OrganicImage'] || node.data['#ThumbImage'] || node.data['#Image1'] || '';
    console.log(`[PageCreator] ${node.type} изображение: "${imgUrl ? imgUrl.substring(0, 60) + '...' : '(пусто)'}"`);
  }
  
  // Применяем данные через handlers
  if (node.data && Object.keys(node.data).length > 0) {
    try {
      const instanceCache = buildInstanceCache(instance);
      const context: HandlerContext = {
        container: instance,
        containerKey: instance.id,
        row: node.data,
        instanceCache,
      };
      await handlerRegistry.executeAll(context);
      
      // Применяем изображения
      await applySnippetImages(instance, node.data);
      
      // Применяем фавиконку
      await applyFavicon(instance, node.data);
      
      // Применяем аватар автора цитаты
      await applyQuoteAvatar(instance, node.data);
    } catch (e) {
      Logger.debug(`[PageCreator] Ошибка применения данных: ${e}`);
    }
  }
  
  return instance;
}

/**
 * Создаёт панель быстрых фильтров EQuickFilters
 */
async function createEQuickFiltersPanel(
  node: StructureNode,
  platform: 'desktop' | 'touch'
): Promise<FrameNode | null> {
  const data = node.data || {};
  const filterButtons: string[] = [];
  
  // Собираем кнопки фильтров
  const count = parseInt(data['#FilterButtonsCount'] || '0', 10);
  for (let i = 1; i <= count; i++) {
    const text = data[`#FilterButton_${i}`];
    if (text) filterButtons.push(text);
  }
  
  if (filterButtons.length === 0) {
    Logger.debug('[EQuickFilters] Нет кнопок фильтров');
    return null;
  }
  
  Logger.info(`[EQuickFilters] Создаём панель с ${filterButtons.length} фильтрами`);
  
  // Создаём Auto Layout фрейм
  const panel = figma.createFrame();
  panel.name = 'EQuickFilters';
  panel.layoutMode = 'HORIZONTAL';
  panel.primaryAxisSizingMode = 'AUTO';
  panel.counterAxisSizingMode = 'AUTO';
  panel.itemSpacing = 8;
  panel.paddingTop = 12;
  panel.paddingRight = 16;
  panel.paddingBottom = 12;
  panel.paddingLeft = 16;
  panel.fills = [];
  
  // Добавляем кнопку "Все фильтры" если есть
  if (data['#AllFiltersButton'] === 'true' && FILTER_COMPONENTS.FilterButton.key) {
    try {
      const filterBtnComponent = await figma.importComponentByKeyAsync(FILTER_COMPONENTS.FilterButton.variantKey);
      if (filterBtnComponent) {
        const filterBtnInstance = filterBtnComponent.createInstance();
        panel.appendChild(filterBtnInstance);
        Logger.debug('[EQuickFilters] Добавлена кнопка "Все фильтры"');
      }
    } catch (e) {
      Logger.warn(`[EQuickFilters] Не удалось импортировать FilterButton: ${e}`);
    }
  }
  
  // Добавляем кнопки быстрых фильтров с разными типами
  if (FILTER_COMPONENTS.QuickFilterButton.key) {
    try {
      const quickFilterBtnComponent = await figma.importComponentByKeyAsync(FILTER_COMPONENTS.QuickFilterButton.variantKey);
      if (quickFilterBtnComponent) {
        for (let i = 0; i < filterButtons.length; i++) {
          const text = filterButtons[i];
          const buttonType = data[`#FilterButtonType_${i + 1}`] || 'dropdown';
          
          const btnInstance = quickFilterBtnComponent.createInstance();
          panel.appendChild(btnInstance);

          const availableProps = btnInstance.componentProperties;

          // Определяем View и Right в зависимости от типа кнопки:
          // - dropdown: View=Secondary, Right=true (иконка-стрелка)
          // - sort: View=Secondary, Right=false (без иконки)
          // - suggest: View=Outline, Right=false (без иконки)
          let viewValue = 'Secondary';
          let rightValue = false;
          
          if (buttonType === 'dropdown') {
            viewValue = 'Secondary';
            rightValue = true;
          } else if (buttonType === 'sort') {
            viewValue = 'Secondary';
            rightValue = false;
          } else if (buttonType === 'suggest') {
            viewValue = 'Outline';
            rightValue = false;
          }

          // Шаг 1: Устанавливаем VARIANT свойства (View, Size, Text)
          try {
            const variantProps: Record<string, string> = {
              'View': viewValue,
              'Size': 'M',
              'Text': 'True',
            };
            btnInstance.setProperties(variantProps);
            console.log(`[EQuickFilters] "${text}" variant: View=${viewValue}`);
          } catch (e) {
            console.error(`[EQuickFilters] Ошибка установки variant свойств:`, e);
          }

          // Шаг 2: Устанавливаем BOOLEAN свойства (Right, Left) отдельно
          try {
            const booleanProps: Record<string, boolean> = {};
            
            for (const propKey in availableProps) {
              const prop = availableProps[propKey];
              if (prop.type !== 'BOOLEAN') continue;
              
              const propName = propKey.split('#')[0];
              
              // Right → зависит от типа кнопки
              if (propName === 'Right') {
                booleanProps[propKey] = rightValue;
              }
              // Left → всегда false
              else if (propName === 'Left') {
                booleanProps[propKey] = false;
              }
            }
            
            if (Object.keys(booleanProps).length > 0) {
              btnInstance.setProperties(booleanProps);
              console.log(`[EQuickFilters] "${text}" boolean: Right=${rightValue}`);
            }
          } catch (e) {
            console.error(`[EQuickFilters] Ошибка установки boolean свойств:`, e);
          }

          // Ищем текстовый слой внутри и меняем текст
          const textNode = findTextNode(btnInstance);
          if (textNode) {
            await figma.loadFontAsync(textNode.fontName as FontName);
            textNode.characters = text;
            Logger.debug(`[EQuickFilters] Кнопка: "${text}" (${buttonType}, View=${viewValue}, Right=${rightValue})`);
          } else {
            Logger.warn(`[EQuickFilters] Не найден текстовый слой в кнопке`);
          }
        }
        Logger.debug(`[EQuickFilters] Добавлено ${filterButtons.length} кнопок фильтров`);
      }
    } catch (e) {
      Logger.warn(`[EQuickFilters] Не удалось импортировать QuickFilterButton: ${e}`);
    }
  }
  
  return panel;
}

/**
 * Рендерить узел структуры в Figma
 * Возвращает созданный элемент (инстанс или фрейм)
 */
async function renderStructureNode(
  node: StructureNode,
  platform: 'desktop' | 'touch',
  errors: PageCreationError[],
  parentContainerType?: ContainerType
): Promise<{ element: SceneNode | null; count: number }> {
  let count = 0;

  // Обработка EQuickFilters (панель фильтров)
  if (node.type === 'EQuickFilters') {
    const panel = await createEQuickFiltersPanel(node, platform);
    if (panel) {
      return { element: panel, count: 1 };
    }
    return { element: null, count: 0 };
  }

  // Если это контейнер — создаём фрейм и рендерим детей
  if (isContainerType(node.type)) {
    const containerConfig = getContainerConfig(node.type as ContainerType);
    if (!containerConfig) {
      Logger.warn(`[PageCreator] Нет конфигурации контейнера: ${node.type}`);
      return { element: null, count: 0 };
    }

    const containerFrame = createContainerFrame(containerConfig);
    const thisContainerType = node.type as ContainerType;

    // Рендерим дочерние узлы с передачей типа родительского контейнера
    if (node.children) {
      for (const child of node.children) {
        const result = await renderStructureNode(child, platform, errors, thisContainerType);
        if (result.element) {
          // Сначала добавляем в контейнер
          containerFrame.appendChild(result.element);

          // Потом устанавливаем ширину (FILL можно только после appendChild)
          if (containerConfig.childWidth === 'FILL') {
            (result.element as InstanceNode).layoutSizingHorizontal = 'FILL';
          } else if (typeof containerConfig.childWidth === 'number') {
            (result.element as InstanceNode).resize(
              containerConfig.childWidth,
              (result.element as InstanceNode).height
            );
          }

          count += result.count;
        }
      }
    }

    Logger.debug(`[PageCreator] Контейнер ${node.type}: ${node.children?.length || 0} элементов`);
    return { element: containerFrame, count };
  }

  // Иначе — создаём инстанс сниппета
  try {
    const instance = await createSnippetInstance(node, platform, parentContainerType);
    if (instance) {
      count = 1;
      return { element: instance, count };
    } else {
      errors.push({
        elementId: node.id,
        elementType: node.type,
        message: 'Не удалось создать инстанс',
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push({
      elementId: node.id,
      elementType: node.type,
      message: msg,
    });
    Logger.error(`[PageCreator] Ошибка создания ${node.type}:`, e);
  }
  
  return { element: null, count: 0 };
}

// ============================================================================
// MAIN PAGE CREATION
// ============================================================================

/**
 * Создать SERP страницу с полной структурой
 * 
 * Desktop структура (1440px):
 * - query (vertical, hug, padding=0, gap=0)
 *   ├── Header (Desktop=true)
 *   ├── main__center (vertical, fill, hug)
 *   │   └── main__content (horizontal, fill, hug, gap=0, paddingLeft=100)
 *   │       ├── content__left (vertical, 792px, hug) — сниппеты
 *   │       └── content__right (vertical, fill, hug)
 *   └── Footer
 * 
 * Touch структура (393px):
 * - query (vertical, hug, padding=0, gap=0)
 *   ├── Header (Desktop=false, Upscroll=false)
 *   ├── main__center (vertical, fill, hug)
 *   │   └── main__content (vertical, fill, hug) — сниппеты напрямую
 *   └── Footer
 */
export async function createSerpPage(
  rows: import('../types').CSVRow[],
  options: {
    query?: string;
    platform?: 'desktop' | 'touch';
    contentLeftWidth?: number;
    contentGap?: number;
    leftPadding?: number;
  } = {}
): Promise<PageCreationResult> {
  const startTime = Date.now();
  const errors: PageCreationError[] = [];
  let createdCount = 0;
  
  const platform = options.platform || 'desktop';
  const isTouch = platform === 'touch';
  const query = options.query || rows[0]?.['#query'] || rows[0]?.query || 'query';
  const contentLeftWidth = options.contentLeftWidth || 792;
  const contentGap = options.contentGap ?? 0;
  const leftPadding = isTouch ? 0 : (options.leftPadding || 100);
  
  // Размеры для разных платформ
  const pageWidth = isTouch ? 393 : 1440;
  
  Logger.info(`[PageCreator] Создание SERP страницы: "${query}", ${rows.length} сниппетов, platform=${platform}`);
  
  // === 0. Построение структуры из rows ===
  const structure = buildPageStructure(rows, { query, platform });
  const sortedNodes = sortContentNodes(structure.contentLeft);
  
  Logger.info(`[PageCreator] Структура: ${sortedNodes.length} узлов, ${structure.stats.containers} контейнеров`);
  
  // === 1. Основной контейнер ===
  const pageFrame = figma.createFrame();
  pageFrame.name = String(query);
  pageFrame.layoutMode = 'VERTICAL';
  pageFrame.primaryAxisSizingMode = 'AUTO';  // hug height
  pageFrame.counterAxisSizingMode = 'FIXED';
  pageFrame.resize(pageWidth, 100);
  pageFrame.itemSpacing = 0;
  pageFrame.paddingTop = 0;
  pageFrame.paddingRight = 0;
  pageFrame.paddingBottom = 0;
  pageFrame.paddingLeft = 0;
  pageFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  
  // Позиционируем
  pageFrame.x = figma.viewport.center.x - pageWidth / 2;
  pageFrame.y = figma.viewport.center.y;
  
  // === 2. Header ===
  try {
    const headerConfig = LAYOUT_COMPONENT_MAP['Header'];
    if (headerConfig?.key) {
      const headerComponent = await importComponent(headerConfig.key);
      if (headerComponent) {
        const headerInstance = headerComponent.createInstance();
        
        // Для touch: Desktop=false (или desktop=false — проверим оба варианта)
        console.log(`[PageCreator] Header: isTouch=${isTouch}, platform=${platform}`);
        
        // Сначала выведем доступные свойства Header
        try {
          const headerProps = Object.keys(headerInstance.componentProperties || {});
          console.log(`[PageCreator] Header доступные свойства: ${headerProps.join(', ')}`);
        } catch (e) {
          console.log(`[PageCreator] Header: не удалось получить свойства`);
        }
        
        if (isTouch) {
          // Desktop — это variant property со значениями "True" | "False" (строки!)
          try {
            headerInstance.setProperties({
              Desktop: 'False',  // Строка, не boolean!
            });
            console.log('[PageCreator] ✅ Header: Desktop="False" установлено');
          } catch (e1) {
            console.log(`[PageCreator] ❌ Header Desktop="False" failed: ${e1}`);
          }
        } else {
          console.log('[PageCreator] Header: Desktop="True" (по умолчанию, свойства не меняем)');
        }
        
        pageFrame.appendChild(headerInstance);
        headerInstance.layoutSizingHorizontal = 'FILL';
        createdCount++;
        Logger.debug('[PageCreator] Header добавлен');
      }
    } else {
      Logger.warn('[PageCreator] Нет ключа для Header');
    }
  } catch (e) {
    errors.push({ elementId: 'header', elementType: 'Header', message: String(e) });
  }
  
  // === 3. main__center ===
  const mainCenter = figma.createFrame();
  mainCenter.name = 'main__center';
  mainCenter.layoutMode = 'VERTICAL';
  mainCenter.primaryAxisSizingMode = 'AUTO';
  mainCenter.counterAxisSizingMode = 'AUTO';
  mainCenter.itemSpacing = 0;
  mainCenter.paddingTop = 0;
  mainCenter.paddingRight = 0;
  mainCenter.paddingBottom = 0;
  mainCenter.paddingLeft = 0;
  mainCenter.fills = [];
  pageFrame.appendChild(mainCenter);
  mainCenter.layoutSizingHorizontal = 'FILL';
  
  // === 4. main__content ===
  const mainContent = figma.createFrame();
  mainContent.name = 'main__content';
  // Touch: vertical layout, Desktop: horizontal layout
  mainContent.layoutMode = isTouch ? 'VERTICAL' : 'HORIZONTAL';
  mainContent.primaryAxisSizingMode = isTouch ? 'AUTO' : 'FIXED';
  mainContent.counterAxisSizingMode = 'AUTO';
  mainContent.itemSpacing = contentGap;
  mainContent.paddingTop = 0;
  mainContent.paddingRight = 0;
  mainContent.paddingBottom = 0;
  mainContent.paddingLeft = leftPadding;
  mainContent.fills = [];
  mainCenter.appendChild(mainContent);
  mainContent.layoutSizingHorizontal = 'FILL';
  
  // Контейнер для сниппетов (для touch — сам mainContent, для desktop — content__left)
  let snippetsContainer: FrameNode;
  
  if (isTouch) {
    // Touch: элементы складываем прямо в main__content
    snippetsContainer = mainContent;
  } else {
    // Desktop: создаём content__left и content__right
    
    // === 5. content__left ===
    const contentLeftFrame = figma.createFrame();
    contentLeftFrame.name = 'content__left';
    contentLeftFrame.layoutMode = 'VERTICAL';
    contentLeftFrame.primaryAxisSizingMode = 'AUTO';
    contentLeftFrame.counterAxisSizingMode = 'FIXED';
    contentLeftFrame.resize(contentLeftWidth, 100);
    contentLeftFrame.itemSpacing = 0;
    contentLeftFrame.paddingTop = 0;
    contentLeftFrame.paddingRight = 0;
    contentLeftFrame.paddingBottom = 0;
    contentLeftFrame.paddingLeft = 0;
    contentLeftFrame.fills = [];
    mainContent.appendChild(contentLeftFrame);
    
    // === 6. content__right ===
    const contentRightFrame = figma.createFrame();
    contentRightFrame.name = 'content__right';
    contentRightFrame.layoutMode = 'VERTICAL';
    contentRightFrame.primaryAxisSizingMode = 'AUTO';
    contentRightFrame.counterAxisSizingMode = 'AUTO';
    contentRightFrame.itemSpacing = 0;
    contentRightFrame.paddingTop = 0;
    contentRightFrame.paddingRight = 0;
    contentRightFrame.paddingBottom = 0;
    contentRightFrame.paddingLeft = 0;
    contentRightFrame.fills = [];
    mainContent.appendChild(contentRightFrame);
    contentRightFrame.layoutSizingHorizontal = 'FILL';
    
    snippetsContainer = contentLeftFrame;
  }
  
  // === 7. Рендерим структуру ===
  for (const node of sortedNodes) {
    const result = await renderStructureNode(node, platform, errors);
    
    if (result.element) {
      // Сначала добавляем в контейнер
      snippetsContainer.appendChild(result.element);
      
      // Потом устанавливаем fill width (только после appendChild)
      if (result.element.type === 'FRAME' || result.element.type === 'INSTANCE') {
        (result.element as FrameNode | InstanceNode).layoutSizingHorizontal = 'FILL';
      }
      
      createdCount += result.count;
    }
  }
  
  // === 8. Footer ===
  try {
    const footerConfig = LAYOUT_COMPONENT_MAP['Footer'];
    if (footerConfig?.key) {
      const footerComponent = await importComponent(footerConfig.key);
      if (footerComponent) {
        const footerInstance = footerComponent.createInstance();
        pageFrame.appendChild(footerInstance);
        footerInstance.layoutSizingHorizontal = 'FILL';
        createdCount++;
        Logger.debug('[PageCreator] Footer добавлен');
      }
    } else {
      Logger.warn('[PageCreator] Нет ключа для Footer');
    }
  } catch (e) {
    errors.push({ elementId: 'footer', elementType: 'Footer', message: String(e) });
  }
  
  // === 9. Финализация ===
  figma.currentPage.selection = [pageFrame];
  figma.viewport.scrollAndZoomIntoView([pageFrame]);
  
  const creationTime = Date.now() - startTime;
  
  Logger.info(`[PageCreator] SERP страница создана: ${createdCount} элементов за ${creationTime}ms`);
  if (errors.length > 0) {
    Logger.warn(`[PageCreator] Ошибок: ${errors.length}`);
  }
  
  return {
    success: errors.length === 0 || createdCount > 0,
    frame: pageFrame,
    createdCount,
    errors: errors.map(e => `[${e.elementType}] ${e.message}`),
    creationTime,
  };
}

/**
 * Проверить доступность компонентов библиотеки
 * Возвращает список компонентов с неустановленными ключами
 */
export function validateComponentKeys(): string[] {
  const missingKeys: string[] = [];
  
  for (const [type, config] of Object.entries(SNIPPET_COMPONENT_MAP)) {
    if (!config.key) {
      missingKeys.push(`Snippet: ${type}`);
    }
  }
  
  for (const [type, config] of Object.entries(GROUP_COMPONENT_MAP)) {
    if (!config.key) {
      missingKeys.push(`Group: ${type}`);
    }
  }
  
  for (const [type, config] of Object.entries(LAYOUT_COMPONENT_MAP)) {
    if (!config.key) {
      missingKeys.push(`Layout: ${type}`);
    }
  }
  
  return missingKeys;
}

