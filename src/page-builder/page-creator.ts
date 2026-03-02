/**
 * Page Creator — создание структуры страницы в Figma
 * 
 * Создаёт Auto Layout фреймы с инстансами компонентов
 * и заполняет их данными
 */

import { Logger } from '../logger';
import { handlerRegistry } from '../handlers/registry';
import type { HandlerContext } from '../handlers/types';
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
  FILTER_COMPONENTS,
  PAINT_STYLE_KEYS,
  VARIABLE_KEYS,
  ETHUMB_CONFIG
} from './component-map';
import { parsePageStructure } from './structure-parser';
import { buildPageStructure, sortContentNodes } from './structure-builder';
import { StructureNode, ContainerType, SerpPageStructure, ContainerConfig } from './types';
import { renderWizards } from '../plugin/wizard-processor';
import type { WizardPayload } from '../types/wizard-types';

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

/** Creates a placeholder frame when a library component is missing */
async function createPlaceholder(name: string, width: number, height: number): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = '\u26A0 ' + name + ' (component not found)';
  frame.resize(width, height);
  frame.fills = [{ type: 'SOLID', color: { r: 1, g: 0.95, b: 0.9 } }];

  const text = figma.createText();
  try {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  } catch {
    try {
      await figma.loadFontAsync({ family: 'Roboto', style: 'Regular' });
    } catch {
      // Last resort: use whatever default font Figma provides
    }
  }
  text.characters = name;
  text.fontSize = 12;
  text.fills = [{ type: 'SOLID', color: { r: 0.8, g: 0.2, b: 0.2 } }];
  text.x = 8;
  text.y = 8;
  frame.appendChild(text);

  return frame;
}

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
 * Применить переменную заливки из библиотеки к узлу
 * @param node - узел с поддержкой fills (Frame и т.д.)
 * @param variableKey - ключ переменной из VARIABLE_KEYS
 * @returns true если переменная успешно применена
 */
async function applyFillVariable(
  node: SceneNode & { fills?: readonly Paint[] | typeof figma.mixed },
  variableKey: string
): Promise<boolean> {
  if (!variableKey) {
    Logger.debug('[PageCreator] Пустой ключ переменной');
    return false;
  }
  
  try {
    // Импортируем переменную из библиотеки
    const variable = await figma.variables.importVariableByKeyAsync(variableKey);
    
    if (!variable) {
      Logger.warn(`[PageCreator] Переменная не найдена (key=${variableKey})`);
      return false;
    }
    
    // Создаём базовый solid paint
    const basePaint: SolidPaint = {
      type: 'SOLID',
      color: { r: 1, g: 1, b: 1 }, // Белый как fallback
    };
    
    // Привязываем переменную к цвету
    const boundPaint = figma.variables.setBoundVariableForPaint(basePaint, 'color', variable);
    
    // Применяем к узлу
    (node as FrameNode).fills = [boundPaint];
    
    Logger.debug(`[PageCreator] Применена переменная заливки: ${variable.name}`);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger.warn(`[PageCreator] Не удалось применить переменную заливки (key=${variableKey}): ${msg}`);
  }
  return false;
}

/**
 * Применить стиль заливки из библиотеки к узлу
 * @param node - узел с поддержкой fills (Frame, Instance и т.д.)
 * @param styleKey - ключ стиля из PAINT_STYLE_KEYS
 * @returns true если стиль успешно применён
 * 
 * @deprecated Используйте applyFillVariable для более надёжной привязки
 */
async function applyFillStyle(
  node: SceneNode & { fillStyleId?: string | typeof figma.mixed },
  styleKey: string
): Promise<boolean> {
  try {
    const style = await figma.importStyleByKeyAsync(styleKey);
    if (style && style.type === 'PAINT') {
      (node as FrameNode).fillStyleId = style.id;
      Logger.debug(`[PageCreator] Применён стиль заливки: ${style.name}`);
      return true;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger.warn(`[PageCreator] Не удалось применить стиль заливки (key=${styleKey}): ${msg}`);
  }
  return false;
}

/**
 * Применить заливку к узлу (переменная или стиль как fallback)
 * Сначала пытается применить переменную, если ключ задан.
 * Если переменная не настроена или не удалось — пробует стиль.
 * 
 * @param node - узел с поддержкой fills
 * @param colorName - имя цвета из VARIABLE_KEYS / PAINT_STYLE_KEYS (например, 'Background/Primary')
 * @returns true если заливка успешно применена
 */
async function applyFill(
  node: SceneNode & { fills?: readonly Paint[] | typeof figma.mixed; fillStyleId?: string | typeof figma.mixed },
  colorName: keyof typeof VARIABLE_KEYS
): Promise<boolean> {
  // 1. Сначала пробуем переменную
  const variableKey = VARIABLE_KEYS[colorName];
  if (variableKey) {
    const applied = await applyFillVariable(node, variableKey);
    if (applied) return true;
  }
  
  // 2. Fallback на стиль
  const styleKey = PAINT_STYLE_KEYS[colorName];
  if (styleKey) {
    return applyFillStyle(node, styleKey);
  }
  
  Logger.warn(`[PageCreator] Нет ключа для цвета: ${colorName}`);
  return false;
}

/**
 * Создать инстанс компонента для элемента страницы
 */
async function createInstanceForElement(
  element: PageElement,
  platform: 'desktop' | 'touch'
): Promise<InstanceNode | FrameNode | null> {
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
    Logger.warn('[PageCreator] Component not found, using placeholder: ' + element.type);
    return createPlaceholder(element.type, 360, 120);
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
): Promise<InstanceNode | FrameNode | null> {
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
    if (element.children.length > 0 && groupInstance.type === 'INSTANCE') {
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
      let instance: InstanceNode | FrameNode | null = null;

      if (isGroupType(element.type)) {
        // Создаём группу
        instance = await createGroupWithChildren(element, opts.platform);
      } else {
        // Создаём одиночный сниппет
        instance = await createInstanceForElement(element, opts.platform);

        if (instance && instance.type === 'INSTANCE') {
          // Применяем данные (only for real instances, not placeholders)
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
  // primaryAxis: для HORIZONTAL — это ширина, для VERTICAL — высота
  // counterAxis: для HORIZONTAL — это высота, для VERTICAL — ширина
  if (config.layoutMode === 'HORIZONTAL') {
    // Горизонтальный layout: primaryAxis = ширина
    frame.primaryAxisSizingMode = config.width === 'HUG' ? 'AUTO' : 'FIXED';
    frame.counterAxisSizingMode = config.height === 'HUG' ? 'AUTO' : 'FIXED';
  } else {
    // Вертикальный layout или WRAP: primaryAxis = высота
    frame.primaryAxisSizingMode = config.height === 'HUG' ? 'AUTO' : 'FIXED';
    frame.counterAxisSizingMode = config.width === 'FILL' || config.width === 'HUG' ? 'AUTO' : 'FIXED';
  }
  
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
  
  // Clips content
  if (config.clipsContent !== undefined) {
    frame.clipsContent = config.clipsContent;
  }
  
  return frame;
}

/**
 * Найти слой изображения внутри контейнера
 */
function findImageLayer(container: SceneNode, names: string[]): SceneNode | null {
  if (!('children' in container)) return null;
  
  // Сначала ищем точное совпадение
  for (const name of names) {
    const found = findLayerRecursive(container, name);
    if (found) return found;
  }
  
  // Fallback: ищем слой с "Image" или "Thumb" в имени (частичное совпадение)
  const partialFound = findLayerByPartialName(container, ['Image', 'Thumb', 'image', 'thumb']);
  if (partialFound) {
    console.log(`[findImageLayer] Найден по частичному совпадению: "${partialFound.name}"`);
    return partialFound;
  }
  
  return null;
}

/**
 * Ищет слой по частичному совпадению имени (contains)
 */
function findLayerByPartialName(node: SceneNode, patterns: string[]): SceneNode | null {
  // Проверяем текущий узел — ищем только слои с fills (Rectangle, Frame)
  if ('fills' in node && patterns.some(p => node.name.includes(p))) {
    return node;
  }
  
  if (!('children' in node)) return null;
  
  for (const child of node.children) {
    const found = findLayerByPartialName(child, patterns);
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
  // Добавлены имена для AdvGallery и других вариантов компонентов
  const layerNames = [
    '#OrganicImage', '#ThumbImage', 
    'Image Ratio', 'EThumb-Image', 
    '#Image', '#Image1',
    // Дополнительные имена для AdvGallery и других вариантов
    'Image', 'Thumb', 'image',
    'EProductSnippet2-Image', 'EProductSnippet2-Thumb',
    'AdvGallery-Image', 'Card-Image',
    'EThumb', 'Photo', 'Picture'
  ];
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
): Promise<InstanceNode | FrameNode | null> {
  let config = getComponentConfig(node.type as SnippetType);
  let actualType = node.type;

  // Fallback: если нет ключа — используем ESnippet для органических сниппетов
  if (!config || !config.key) {
    if (node.type === 'Organic' || node.type === 'Organic_withOfferInfo') {
      config = getComponentConfig('ESnippet');
      actualType = 'ESnippet';
      Logger.debug(`[PageCreator] Fallback: ${node.type} → ESnippet`);
    } else {
      Logger.warn('[PageCreator] Component not found, using placeholder: ' + node.type);
      return createPlaceholder(node.type, 360, 120);
    }
  }

  if (!config || !config.key) {
    Logger.warn('[PageCreator] Component not found, using placeholder: ' + node.type + ' (fallback failed)');
    return createPlaceholder(node.type, 360, 120);
  }

  // Для touch-платформы используем keyTouch если он существует
  const componentKey = (platform === 'touch' && (config as any).keyTouch)
    ? (config as any).keyTouch
    : config.key;

  console.log(`[PageCreator] ${node.type}: platform=${platform}, key=${componentKey.substring(0, 16)}...`);

  const component = await importComponent(componentKey);
  if (!component) {
    Logger.warn('[PageCreator] Component not found, using placeholder: ' + node.type);
    return createPlaceholder(node.type, 360, 120);
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
 * @param node - узел структуры
 * @param platform - платформа (desktop/touch)
 * @param errors - массив ошибок для накопления
 * @param parentContainerType - тип родительского контейнера
 * @param query - поисковый запрос (для заголовков)
 */

// ============================================================================
// ImagesGrid — justified grid из EThumb
// ============================================================================

/**
 * Находит первый вложенный слой с поддержкой fills (для заливки изображением).
 * Пропускает TEXT и слишком маленькие элементы.
 */
function findFillableLayer(node: SceneNode): SceneNode | null {
  if ('children' in node) {
    for (var ci = 0; ci < (node as FrameNode).children.length; ci++) {
      var child = (node as FrameNode).children[ci];
      if (child.removed || child.type === 'TEXT') continue;
      if ('fills' in child && 'width' in child) {
        var w = (child as SceneNode & { width: number }).width;
        var h = (child as SceneNode & { height: number }).height;
        if (w > 20 && h > 20) return child;
      }
      var deep = findFillableLayer(child);
      if (deep) return deep;
    }
  }
  return null;
}

interface ImageGridItem {
  url: string;
  width: number;
  height: number;
  row: number;
}

/**
 * Создаёт панель ImagesGrid — justified grid из EThumb инстансов
 */
async function createImagesGridPanel(
  node: StructureNode,
  platform: 'desktop' | 'touch'
): Promise<{ element: FrameNode; count: number } | null> {
  var data = node.data || (node.children && node.children[0] && node.children[0].data) || {};
  var imagesJson = data['#ImagesGrid_data'];
  if (!imagesJson) {
    Logger.warn('[ImagesGrid] Нет данных #ImagesGrid_data');
    return null;
  }

  var images: ImageGridItem[];
  try {
    images = JSON.parse(imagesJson);
  } catch (e) {
    Logger.error('[ImagesGrid] Ошибка парсинга JSON:', e);
    return null;
  }

  if (images.length === 0) {
    Logger.warn('[ImagesGrid] Пустой массив картинок');
    return null;
  }

  var title = data['#ImagesGrid_title'] || 'Картинки';

  // Импортируем EThumb (variant: Type=New; feb-26, Ratio=Manual)
  var eThumbComponent = await importComponent(ETHUMB_CONFIG.manualVariantKey);
  if (!eThumbComponent) {
    Logger.error('[ImagesGrid] Не удалось импортировать EThumb');
    return null;
  }

  // === Wrapper frame (VERTICAL) ===
  var wrapper = figma.createFrame();
  wrapper.name = 'ImagesGrid';
  wrapper.layoutMode = 'VERTICAL';
  wrapper.primaryAxisSizingMode = 'AUTO';
  wrapper.counterAxisSizingMode = 'AUTO';
  wrapper.itemSpacing = 12;
  wrapper.fills = [];
  // FILL width устанавливается после appendChild в родитель
  // (layoutSizingHorizontal = 'FILL' требует наличия parent)

  // === Заголовок «Картинки» ===
  var titleConfig = LAYOUT_COMPONENT_MAP['Title'];
  if (titleConfig && titleConfig.key) {
    var titleComponent = await importComponent(titleConfig.key);
    if (titleComponent) {
      var titleInstance = titleComponent.createInstance();
      wrapper.appendChild(titleInstance);
      titleInstance.layoutSizingHorizontal = 'FILL';

      var textNode = findTextNode(titleInstance);
      if (textNode) {
        try {
          await figma.loadFontAsync(textNode.fontName as FontName);
          textNode.characters = title;
        } catch (e) { Logger.debug('[ImagesGrid] Title text set failed'); }
      }
    }
  }

  // === Grid content (VERTICAL, gap=6 между рядами) ===
  var gridFrame = figma.createFrame();
  gridFrame.name = 'ImagesGridContent';
  gridFrame.layoutMode = 'VERTICAL';
  gridFrame.primaryAxisSizingMode = 'AUTO';
  gridFrame.counterAxisSizingMode = 'AUTO';
  gridFrame.itemSpacing = 6;
  gridFrame.fills = [];
  wrapper.appendChild(gridFrame);

  // Группируем по рядам
  var rowMap = new Map<number, ImageGridItem[]>();
  for (var i = 0; i < images.length; i++) {
    var img = images[i];
    var rowItems = rowMap.get(img.row);
    if (!rowItems) {
      rowItems = [];
      rowMap.set(img.row, rowItems);
    }
    rowItems.push(img);
  }

  var count = 0;

  // Создаём ряды
  var rowIndices = Array.from(rowMap.keys()).sort();
  for (var ri = 0; ri < rowIndices.length; ri++) {
    var rowIndex = rowIndices[ri];
    var rowImages = rowMap.get(rowIndex)!;

    // Row frame (HORIZONTAL, gap=6)
    var rowFrame = figma.createFrame();
    rowFrame.name = 'ImagesGridRow-' + rowIndex;
    rowFrame.layoutMode = 'HORIZONTAL';
    rowFrame.primaryAxisSizingMode = 'AUTO';
    rowFrame.counterAxisSizingMode = 'AUTO';
    rowFrame.itemSpacing = 6;
    rowFrame.fills = [];
    gridFrame.appendChild(rowFrame);

    // Создаём EThumb инстансы
    for (var j = 0; j < rowImages.length; j++) {
      var imageItem = rowImages[j];

      var instance = eThumbComponent.createInstance();
      rowFrame.appendChild(instance);

      // Устанавливаем properties
      try {
        instance.setProperties(ETHUMB_CONFIG.gridDefaults);
      } catch (e) {
        Logger.debug('[ImagesGrid] Ошибка setProperties: ' + e);
      }

      // Resize to match original dimensions
      try {
        instance.resize(
          Math.round(imageItem.width),
          Math.round(imageItem.height)
        );
      } catch (e) {
        Logger.debug('[ImagesGrid] Ошибка resize: ' + e);
      }

      // Загружаем и применяем изображение к вложенному fillable слою
      if (imageItem.url) {
        var imageLayer = findFillableLayer(instance);
        if (imageLayer) {
          await loadAndApplyImage(imageLayer, imageItem.url, '[ImagesGrid]');
        } else {
          // Fallback: применяем к самому инстансу
          await loadAndApplyImage(instance, imageItem.url, '[ImagesGrid]');
        }
      }

      count++;
    }
  }

  Logger.debug('[ImagesGrid] Создано ' + count + ' картинок в ' + rowIndices.length + ' рядах');
  return { element: wrapper, count: count };
}

async function renderStructureNode(
  node: StructureNode,
  platform: 'desktop' | 'touch',
  errors: PageCreationError[],
  parentContainerType?: ContainerType,
  query?: string
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

    const thisContainerType = node.type as ContainerType;
    
    // === ProductsTiles: оборачиваем в productTilesWrapper с Title ===
    if (thisContainerType === 'ProductsTiles') {
      const wrapper = figma.createFrame();
      wrapper.name = 'productTilesWrapper';
      wrapper.layoutMode = 'VERTICAL';
      wrapper.primaryAxisSizingMode = 'AUTO';
      wrapper.counterAxisSizingMode = 'AUTO';
      wrapper.itemSpacing = 0;
      wrapper.paddingTop = 16;
      wrapper.paddingBottom = 16;
      wrapper.paddingLeft = 15;
      wrapper.paddingRight = 15;
      wrapper.cornerRadius = 16;
      wrapper.clipsContent = true;
      await applyFill(wrapper, 'Background/Primary');
      
      // Добавляем Title
      const titleConfig = LAYOUT_COMPONENT_MAP['Title'];
      if (titleConfig?.key) {
        try {
          const titleComponent = await importComponent(titleConfig.key);
          if (titleComponent) {
            const titleInstance = titleComponent.createInstance();
            
            // Применяем defaultVariant свойства (отключаем лишние элементы)
            if (titleConfig.defaultVariant) {
              try {
                titleInstance.setProperties(titleConfig.defaultVariant as Record<string, string | boolean>);
              } catch (e) {
                Logger.debug(`[PageCreator] Title setProperties: ${e}`);
              }
            }
            
            wrapper.appendChild(titleInstance);
            titleInstance.layoutSizingHorizontal = 'FILL';
            
            // Устанавливаем текст заголовка
            const titleText = query 
              ? `Популярные товары по запросу «${query}»`
              : 'Популярные товары';
            const textNode = findTextNode(titleInstance);
            if (textNode) {
              await figma.loadFontAsync(textNode.fontName as FontName);
              textNode.characters = titleText;
            }
            
            Logger.debug(`[PageCreator] Title добавлен: "${titleText}"`);
          }
        } catch (e) {
          Logger.warn(`[PageCreator] Не удалось создать Title: ${e}`);
        }
      }
      
      // Создаём ProductsTiles внутри wrapper
      const containerFrame = createContainerFrame(containerConfig);
      wrapper.appendChild(containerFrame);
      containerFrame.layoutSizingHorizontal = 'FILL';
      
      // Рендерим дочерние узлы
      if (node.children) {
        for (const child of node.children) {
          const result = await renderStructureNode(child, platform, errors, thisContainerType, query);
          if (result.element) {
            containerFrame.appendChild(result.element);
            
            // Touch: FILL ширина, Desktop: фиксированная
            const isProductsTilesOnTouch = platform === 'touch';
            if (containerConfig.childWidth === 'FILL' || isProductsTilesOnTouch) {
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
      
      Logger.debug(`[PageCreator] ProductsTiles wrapper: ${node.children?.length || 0} элементов`);
      return { element: wrapper, count };
    }

    // === EntityOffers: оборачиваем в entityOffersWrapper с Title ===
    if (thisContainerType === 'EntityOffers') {
      const wrapper = figma.createFrame();
      wrapper.name = 'entityOffersWrapper';
      wrapper.layoutMode = 'VERTICAL';
      wrapper.primaryAxisSizingMode = 'AUTO';
      wrapper.counterAxisSizingMode = 'AUTO';
      wrapper.clipsContent = true;
      
      // Desktop: без паддингов и скруглений
      // Touch: паддинги, скругления, gap 12px между Title и контентом
      if (platform === 'touch') {
        wrapper.itemSpacing = 12;
        wrapper.paddingTop = 16;
        wrapper.paddingBottom = 16;
        wrapper.paddingLeft = 15;
        wrapper.paddingRight = 15;
        wrapper.cornerRadius = 16;
        await applyFill(wrapper, 'Background/Primary');
      } else {
        wrapper.itemSpacing = 0;
        wrapper.paddingTop = 0;
        wrapper.paddingBottom = 0;
        wrapper.paddingLeft = 0;
        wrapper.paddingRight = 0;
        wrapper.cornerRadius = 0;
        wrapper.fills = [];
      }
      
      // Добавляем Title с текстом из данных (EntityOffersTitle) или дефолтным
      const titleConfig = LAYOUT_COMPONENT_MAP['Title'];
      if (titleConfig?.key) {
        try {
          const titleComponent = await importComponent(titleConfig.key);
          if (titleComponent) {
            const titleInstance = titleComponent.createInstance();
            
            // Применяем defaultVariant свойства (отключаем лишние элементы)
            if (titleConfig.defaultVariant) {
              try {
                titleInstance.setProperties(titleConfig.defaultVariant as Record<string, string | boolean>);
              } catch (e) {
                Logger.debug(`[PageCreator] Title setProperties: ${e}`);
              }
            }
            
            wrapper.appendChild(titleInstance);
            titleInstance.layoutSizingHorizontal = 'FILL';
            
            // Устанавливаем текст заголовка из данных первого ребёнка или дефолтный
            const entityTitle = node.children?.[0]?.data?.['#EntityOffersTitle'] || 'Цены по вашему запросу';
            const textNode = findTextNode(titleInstance);
            if (textNode) {
              await figma.loadFontAsync(textNode.fontName as FontName);
              textNode.characters = String(entityTitle);
            }
            
            Logger.debug(`[PageCreator] EntityOffers Title: "${entityTitle}"`);
          }
        } catch (e) {
          Logger.warn(`[PageCreator] Не удалось создать Title для EntityOffers: ${e}`);
        }
      }
      
      // Создаём EntityOffers контейнер внутри wrapper
      const containerFrame = createContainerFrame(containerConfig);
      // Touch: gap 8px между элементами внутри EntityOffers
      if (platform === 'touch') {
        containerFrame.itemSpacing = 8;
      }
      wrapper.appendChild(containerFrame);
      containerFrame.layoutSizingHorizontal = 'FILL';
      
      // Рендерим дочерние узлы (EShopItem)
      if (node.children) {
        for (const child of node.children) {
          const result = await renderStructureNode(child, platform, errors, thisContainerType, query);
          if (result.element) {
            containerFrame.appendChild(result.element);
            (result.element as InstanceNode).layoutSizingHorizontal = 'FILL';
            count += result.count;
          }
        }
      }
      
      Logger.debug(`[PageCreator] EntityOffers wrapper: ${node.children?.length || 0} элементов`);
      return { element: wrapper, count };
    }

    // === EShopList: оборачиваем в eShopListWrapper с Title ===
    if (thisContainerType === 'EShopList') {
      const wrapper = figma.createFrame();
      wrapper.name = 'eShopListWrapper';
      wrapper.layoutMode = 'VERTICAL';
      wrapper.primaryAxisSizingMode = 'AUTO';
      wrapper.counterAxisSizingMode = 'AUTO';
      wrapper.clipsContent = true;
      
      // Touch: паддинги, скругления, gap 12px между Title и контентом
      wrapper.itemSpacing = 12;
      wrapper.paddingTop = 16;
      wrapper.paddingBottom = 16;
      wrapper.paddingLeft = 15;
      wrapper.paddingRight = 15;
      wrapper.cornerRadius = 16;
      await applyFill(wrapper, 'Background/Primary');
      
      // Добавляем Title с текстом из данных (EShopListTitle) или дефолтным
      const titleConfig = LAYOUT_COMPONENT_MAP['Title'];
      if (titleConfig?.key) {
        try {
          const titleComponent = await importComponent(titleConfig.key);
          if (titleComponent) {
            const titleInstance = titleComponent.createInstance();
            
            // Применяем defaultVariant свойства (отключаем лишние элементы)
            if (titleConfig.defaultVariant) {
              try {
                titleInstance.setProperties(titleConfig.defaultVariant as Record<string, string | boolean>);
              } catch (e) {
                Logger.debug(`[PageCreator] Title setProperties: ${e}`);
              }
            }
            
            wrapper.appendChild(titleInstance);
            titleInstance.layoutSizingHorizontal = 'FILL';
            
            // Устанавливаем текст заголовка из данных первого ребёнка или дефолтный
            const shopListTitle = node.children?.[0]?.data?.['#EShopListTitle'] || 'Цены в магазинах';
            const textNode = findTextNode(titleInstance);
            if (textNode) {
              await figma.loadFontAsync(textNode.fontName as FontName);
              textNode.characters = String(shopListTitle);
            }
            
            Logger.debug(`[PageCreator] EShopList Title: "${shopListTitle}"`);
          }
        } catch (e) {
          Logger.warn(`[PageCreator] Не удалось создать Title для EShopList: ${e}`);
        }
      }
      
      // Создаём EShopList контейнер внутри wrapper (с gap 6px)
      const containerFrame = createContainerFrame(containerConfig);
      wrapper.appendChild(containerFrame);
      containerFrame.layoutSizingHorizontal = 'FILL';
      
      // Рендерим дочерние узлы (EShopItem)
      if (node.children) {
        for (const child of node.children) {
          const result = await renderStructureNode(child, platform, errors, thisContainerType, query);
          if (result.element) {
            containerFrame.appendChild(result.element);
            (result.element as InstanceNode).layoutSizingHorizontal = 'FILL';
            count += result.count;
          }
        }
      }
      
      Logger.debug(`[PageCreator] EShopList wrapper: ${node.children?.length || 0} элементов`);
      return { element: wrapper, count };
    }

    // === ImagesGrid: justified grid из EThumb ===
    if (thisContainerType === 'ImagesGrid') {
      const imagesGridResult = await createImagesGridPanel(node, platform);
      if (imagesGridResult) {
        return { element: imagesGridResult.element, count: imagesGridResult.count };
      }
      return { element: null, count: 0 };
    }

    // === Остальные контейнеры ===
    const containerFrame = createContainerFrame(containerConfig);

    // Рендерим дочерние узлы с передачей типа родительского контейнера
    if (node.children) {
      for (const child of node.children) {
        const result = await renderStructureNode(child, platform, errors, thisContainerType, query);
        if (result.element) {
          // Сначала добавляем в контейнер
          containerFrame.appendChild(result.element);

          // Потом устанавливаем ширину (FILL можно только после appendChild)
          // Touch: для ProductsTiles используем FILL вместо фиксированной ширины
          const isProductsTilesOnTouch = platform === 'touch' && thisContainerType === 'ProductsTiles';
          
          if (containerConfig.childWidth === 'FILL' || isProductsTilesOnTouch) {
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
    wizards?: import('../types/wizard-types').WizardPayload[];
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
  const wizards = options.wizards || [];
  
  // Размеры для разных платформ
  const pageWidth = isTouch ? 393 : 1440;
  
  Logger.info(`[PageCreator] Создание SERP страницы: "${query}", ${rows.length} сниппетов + ${wizards.length} wizard, platform=${platform}`);
  
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
  
  // Touch: фон overflow (серый), Desktop: белый
  if (isTouch) {
    await applyFill(pageFrame, 'Background/Overflow');
  } else {
    pageFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  }
  
  // Позиционируем
  pageFrame.x = figma.viewport.center.x - pageWidth / 2;
  pageFrame.y = figma.viewport.center.y;
  
  // === 2. Header (и headerWrapper для touch) ===
  let headerWrapper: FrameNode | null = null;
  
  try {
    const headerConfig = LAYOUT_COMPONENT_MAP['Header'];
    if (headerConfig?.key) {
      const headerComponent = await importComponent(headerConfig.key);
      if (headerComponent) {
        const headerInstance = headerComponent.createInstance();
        
        console.log(`[PageCreator] Header: isTouch=${isTouch}, platform=${platform}`);
        
        if (isTouch) {
          // Touch: создаём headerWrapper для группировки Header + EQuickFilters
          headerWrapper = figma.createFrame();
          headerWrapper.name = 'headerWrapper';
          headerWrapper.layoutMode = 'VERTICAL';
          headerWrapper.primaryAxisSizingMode = 'AUTO';
          headerWrapper.counterAxisSizingMode = 'AUTO';
          headerWrapper.itemSpacing = 0;
          headerWrapper.paddingTop = 0;
          headerWrapper.paddingRight = 0;
          headerWrapper.paddingBottom = 0;
          headerWrapper.paddingLeft = 0;
          // Скругление только снизу
          headerWrapper.topLeftRadius = 0;
          headerWrapper.topRightRadius = 0;
          headerWrapper.bottomLeftRadius = 16;
          headerWrapper.bottomRightRadius = 16;
          headerWrapper.clipsContent = true;
          await applyFillStyle(headerWrapper, PAINT_STYLE_KEYS['Background/Primary']);
          
          pageFrame.appendChild(headerWrapper);
          headerWrapper.layoutSizingHorizontal = 'FILL';
          
          // Header внутрь headerWrapper
          try {
            headerInstance.setProperties({
              Desktop: 'False',
            });
            console.log('[PageCreator] ✅ Header: Desktop="False" установлено');
          } catch (e1) {
            console.log(`[PageCreator] ❌ Header Desktop="False" failed: ${e1}`);
          }
          
          headerWrapper.appendChild(headerInstance);
          headerInstance.layoutSizingHorizontal = 'FILL';
        } else {
          // Desktop: Header напрямую в pageFrame
          console.log('[PageCreator] Header: Desktop="True" (по умолчанию)');
          pageFrame.appendChild(headerInstance);
          headerInstance.layoutSizingHorizontal = 'FILL';
        }
        
        // Set search query text on the header
        if (query && query !== 'query') {
          // Try exact names first, then find any text node with default placeholder
          const queryNode = headerInstance.findOne(
            (n: SceneNode) => n.type === 'TEXT' && (
              n.name === '#query' || n.name === 'query' || n.name === 'запрос' ||
              n.name === 'Input' || n.name === 'input' ||
              n.name.indexOf('earch') !== -1 || n.name.indexOf('nput') !== -1
            )
          ) as TextNode | null;
          // Fallback: find text node containing "запрос" placeholder text
          const targetNode = queryNode || headerInstance.findOne(
            (n: SceneNode) => n.type === 'TEXT' && (n as TextNode).characters === 'запрос'
          ) as TextNode | null;
          if (targetNode) {
            await figma.loadFontAsync(targetNode.fontName as FontName);
            targetNode.characters = query;
            Logger.debug(`[PageCreator] Header query set: "${query}" (layer: ${targetNode.name})`);
          } else {
            console.log(`[PageCreator] ⚠️ Could not find query text node in Header`);
          }
        }

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
  mainContent.fills = [];
  
  if (isTouch) {
    // Touch: padding top/bottom 8px, боковые 0, gap 8px
    mainContent.itemSpacing = 8;
    mainContent.paddingTop = 8;
    mainContent.paddingRight = 0;
    mainContent.paddingBottom = 8;
    mainContent.paddingLeft = 0;
  } else {
    // Desktop: без padding (кроме left), gap из параметров
    mainContent.itemSpacing = contentGap;
    mainContent.paddingTop = 0;
    mainContent.paddingRight = 0;
    mainContent.paddingBottom = 0;
    mainContent.paddingLeft = leftPadding;
  }
  
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
  // Track serpItemId per child index in snippetsContainer for wizard insertion
  const childSerpItemIds: string[] = [];

  for (const node of sortedNodes) {
    const result = await renderStructureNode(node, platform, errors, undefined, String(query));

    if (result.element) {
      // Touch: EQuickFilters добавляем в headerWrapper вместо snippetsContainer
      if (isTouch && node.type === 'EQuickFilters' && headerWrapper) {
        headerWrapper.appendChild(result.element);
        if (result.element.type === 'FRAME' || result.element.type === 'INSTANCE') {
          (result.element as FrameNode | InstanceNode).layoutSizingHorizontal = 'FILL';
        }
      } else {
        // Остальные элементы — в snippetsContainer
        snippetsContainer.appendChild(result.element);

        // Track serpItemId for this child (from node data or first child's data)
        const nodeData = node.data || (node.children && node.children[0]?.data);
        childSerpItemIds.push(nodeData?.['#serpItemId'] || '');

        // Потом устанавливаем fill width (только после appendChild)
        if (result.element.type === 'FRAME' || result.element.type === 'INSTANCE') {
          (result.element as FrameNode | InstanceNode).layoutSizingHorizontal = 'FILL';
        }
      }

      createdCount += result.count;
    }
  }

  // === 7b. Вставляем wizard-блоки на правильную позицию по serpItemId ===
  if (wizards.length > 0) {
    try {
      const wizardResult = await renderWizards(wizards);

      for (let wi = 0; wi < wizardResult.frames.length; wi++) {
        const wizFrame = wizardResult.frames[wi];
        const wizard = wizards[wi];
        const wizSerpId = wizard?.serpItemId || '';

        // Find insertion index: after the last child whose serpItemId < wizard's serpItemId
        let insertIndex = -1;
        if (wizSerpId) {
          const wizIdNum = parseInt(wizSerpId, 10);
          if (!isNaN(wizIdNum)) {
            for (let ci = 0; ci < childSerpItemIds.length; ci++) {
              const childIdNum = parseInt(childSerpItemIds[ci], 10);
              if (!isNaN(childIdNum) && childIdNum < wizIdNum) {
                insertIndex = ci + 1; // insert AFTER this child
              }
            }
          }
        }

        if (insertIndex >= 0 && insertIndex < snippetsContainer.children.length) {
          snippetsContainer.insertChild(insertIndex, wizFrame);
          // Shift serpItemId tracking to match
          childSerpItemIds.splice(insertIndex, 0, wizSerpId);
        } else {
          // Fallback: after EQuickFilters (index 0) or at start
          const fallbackIdx = childSerpItemIds.length > 0 ? 1 : 0;
          if (fallbackIdx < snippetsContainer.children.length) {
            snippetsContainer.insertChild(fallbackIdx, wizFrame);
            childSerpItemIds.splice(fallbackIdx, 0, wizSerpId);
          } else {
            snippetsContainer.appendChild(wizFrame);
            childSerpItemIds.push(wizSerpId);
          }
        }

        wizFrame.layoutSizingHorizontal = 'FILL';
        createdCount++;
      }

      if (wizardResult.errors.length > 0) {
        for (const err of wizardResult.errors) {
          errors.push({ elementId: 'wizard', elementType: 'FuturisSearch', message: err });
        }
      }
      Logger.info(`[PageCreator] Wizard: ${wizardResult.wizardCount} блоков, ${wizardResult.componentCount} компонентов`);
    } catch (e) {
      errors.push({ elementId: 'wizard', elementType: 'FuturisSearch', message: String(e) });
      Logger.error(`[PageCreator] Ошибка рендеринга wizard: ${e}`);
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

  // === Debug Frame ===
  try {
    var debugFrame = figma.createFrame();
    debugFrame.name = '__contentify_debug__';
    debugFrame.visible = false;
    debugFrame.resize(1, 1);
    debugFrame.fills = [];
    pageFrame.appendChild(debugFrame);

    var debugLines = [
      'operation: build-page',
      'query: ' + (options.query || '?'),
      'platform: ' + platform,
      'nodes: ' + structure.stats.totalSnippets + ' snippets, ' + structure.stats.containers + ' containers',
      'created: ' + createdCount + ' elements in ' + creationTime + 'ms'
    ];

    // Ошибки по типам
    var errorsByType: Record<string, string[]> = {};
    for (var ei = 0; ei < errors.length; ei++) {
      var err = errors[ei];
      if (!errorsByType[err.elementType]) errorsByType[err.elementType] = [];
      errorsByType[err.elementType].push(err.message);
    }
    for (var etype in errorsByType) {
      if (Object.prototype.hasOwnProperty.call(errorsByType, etype)) {
        var msgs = errorsByType[etype];
        var uniqueMsgs = Array.from(new Set(msgs));
        debugLines.push('[' + etype + '] errors(' + msgs.length + '): ' + uniqueMsgs.join('; '));
      }
    }

    // Типы созданных нод
    var nodeTypes: Record<string, number> = {};
    if (structure.stats.byType) {
      nodeTypes = structure.stats.byType;
    }
    for (var nt in nodeTypes) {
      if (Object.prototype.hasOwnProperty.call(nodeTypes, nt)) {
        debugLines.push('[' + nt + '] x ' + nodeTypes[nt]);
      }
    }

    debugLines.push('errors_total: ' + errors.length);

    for (var di = 0; di < debugLines.length; di++) {
      var lineFrame = figma.createFrame();
      lineFrame.name = debugLines[di];
      lineFrame.resize(1, 1);
      lineFrame.fills = [];
      debugFrame.appendChild(lineFrame);
    }
  } catch (debugErr) {
    Logger.debug('[PageCreator] Debug frame creation failed');
  }

  // === Debug Report (sent to UI → relay) ===
  var debugReport = {
    timestamp: new Date().toISOString(),
    operation: 'build-page',
    success: errors.length === 0 || createdCount > 0,
    duration: creationTime,
    query: options.query || '',
    platform: platform,
    structure: {
      totalNodes: structure.stats.totalSnippets,
      containers: structure.stats.containers,
      byType: structure.stats.byType || {}
    },
    created: {
      total: createdCount
    },
    errors: Object.keys(errorsByType || {}).map(function(t) {
      return { type: t, message: (errorsByType || {})[t].join('; '), count: ((errorsByType || {})[t] || []).length };
    })
  };

  try {
    figma.ui.postMessage({ type: 'debug-report', report: debugReport });
  } catch (e) {
    Logger.debug('[PageCreator] Debug report postMessage failed');
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

