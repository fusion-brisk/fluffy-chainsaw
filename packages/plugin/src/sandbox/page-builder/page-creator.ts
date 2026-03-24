/**
 * Page Creator — создание структуры страницы в Figma
 *
 * Создаёт Auto Layout фреймы с инстансами компонентов
 * и заполняет их данными
 */

import { Logger } from '../../logger';
import { handlerRegistry } from '../handlers/registry';
import type { HandlerContext } from '../handlers/types';
import { buildInstanceCache } from '../../utils/instance-cache';
import { findTextNode } from '../../utils/node-search';
import {
  PageElement,
  PageStructure,
  PageCreationOptions,
  PageCreationResult,
  PageCreationError,
  SnippetType
} from './types';
import {
  getComponentConfig,
  getContainerConfig,
  isGroupType,
  isContainerType,
  SNIPPET_COMPONENT_MAP,
  GROUP_COMPONENT_MAP,
  LAYOUT_COMPONENT_MAP,
  PAINT_STYLE_KEYS,
  VARIABLE_KEYS,
} from './component-map';
import { buildPageStructure, sortContentNodes, detectSnippetType } from './structure-builder';
import { StructureNode, ContainerType, ContainerConfig } from './types';
import { renderWizards } from '../plugin/wizard-processor';
import { loadComponent, createPlaceholder } from './component-import';
import { applyFill, applyFillStyle } from './fill-utils';
import { createInstanceForElement, applyDataToInstance, createGroupWithChildren } from './instance-factory';
import { preloadInstanceFonts, applySnippetImages, applyFavicon, applyQuoteAvatar } from './image-operations';
import {
  createEQuickFiltersPanel,
  createAsideFiltersPanel,
  createImagesGridPanel,
  createContainerFrame,
} from './panel-builders';

// Re-export clearComponentCache so index.ts can import from page-creator (backwards compat)
export { clearComponentCache } from './component-import';

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
 * Создать инстанс сниппета из StructureNode
 */
async function createSnippetInstance(
  node: StructureNode,
  platform: 'desktop' | 'touch',
  parentContainerType?: ContainerType
): Promise<InstanceNode | FrameNode | null> {
  let config = getComponentConfig(node.type as SnippetType);

  // Fallback: если нет ключа — используем ESnippet для органических сниппетов
  if (!config || !config.key) {
    if (node.type === 'Organic' || node.type === 'Organic_withOfferInfo' || node.type === 'Organic_Adv') {
      config = getComponentConfig('ESnippet');
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

  const componentKey = (platform === 'touch' && config.keyTouch)
    ? config.keyTouch
    : config.key;

  Logger.debug(`[PageCreator] ${node.type}: platform=${platform}, key=${componentKey.substring(0, 16)}...`);

  const component = await loadComponent(componentKey);
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

      // Для EProductSnippet2 внутри AdvProductGallery — применяем type=advGallery
      if (node.type === 'EProductSnippet2' && parentContainerType === 'AdvProductGallery') {
        restProps['type'] = 'advGallery';
        Logger.debug(`[PageCreator] ${node.type}: type=advGallery (родитель AdvProductGallery)`);
      }

      // Figma setProperties() silently ignores boolean properties with short names.
      // Variant/string properties (e.g., 'type': 'organic') work with short names,
      // but boolean properties require full key with hash (e.g., 'withPromo#123:456').
      // Resolve short boolean names to full keys via instance.componentProperties.
      const resolvedProps: Record<string, string | boolean> = {};
      const instanceProps = instance.componentProperties;
      for (const shortName in restProps) {
        var val = restProps[shortName];
        if (typeof val === 'boolean') {
          // Find full key for this boolean property
          var fullKey: string | null = null;
          for (var pk in instanceProps) {
            if (pk.split('#')[0] === shortName && instanceProps[pk].type === 'BOOLEAN') {
              fullKey = pk;
              break;
            }
          }
          if (fullKey) {
            resolvedProps[fullKey] = val;
          } else {
            // No matching property found — skip silently
            Logger.debug('[PageCreator] Boolean property not found: ' + shortName);
          }
        } else {
          // Variant/string properties work with short names
          resolvedProps[shortName] = val as string | boolean;
        }
      }

      instance.setProperties(resolvedProps);
      Logger.debug(`[PageCreator] ${node.type}: Platform=${platformValue} (из компонента)`);
    } catch (e) {
      Logger.debug(`[PageCreator] ${node.type} setProperties error: ${e}`);
    }
  } else if (node.type === 'EProductSnippet2' && parentContainerType === 'AdvProductGallery') {
    // Даже если нет defaultVariant — устанавливаем type=advGallery
    try {
      instance.setProperties({ 'type': 'advGallery' });
      Logger.debug(`[PageCreator] ${node.type}: type=advGallery (родитель AdvProductGallery, no defaultVariant)`);
    } catch (e) {
      Logger.debug(`[PageCreator] ${node.type} type=advGallery error: ${e}`);
    }
  }

  // Логируем данные для отладки
  if (node.data) {
    const dataKeys = Object.keys(node.data).filter(k => node.data && (node.data as Record<string, string | undefined>)[k]);
    Logger.debug(`[PageCreator] ${node.type} данные: ${dataKeys.join(', ')}`);
    // Логируем URL изображения отдельно
    const imgUrl = node.data['#OrganicImage'] || node.data['#ThumbImage'] || node.data['#Image1'] || '';
    Logger.debug(`[PageCreator] ${node.type} изображение: "${imgUrl ? imgUrl.substring(0, 60) + '...' : '(пусто)'}"`);
  }

  // Применяем данные через handlers
  if (node.data && Object.keys(node.data).length > 0) {
    try {
      // Bulk preload all fonts in instance before handler execution
      await preloadInstanceFonts(instance);

      const instanceCache = buildInstanceCache(instance);
      const context: HandlerContext = {
        container: instance,
        containerKey: instance.id,
        row: node.data,
        instanceCache,
      };
      await handlerRegistry.executeAll(context);

      // Применяем изображения
      await applySnippetImages(instance, node.data as Record<string, string | undefined>);

      // Применяем фавиконку
      await applyFavicon(instance, node.data as Record<string, string | undefined>);

      // Применяем аватар автора цитаты
      await applyQuoteAvatar(instance, node.data as Record<string, string | undefined>);
    } catch (e) {
      Logger.debug(`[PageCreator] Ошибка применения данных: ${e}`);
    }
  }

  return instance;
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
 * Создать страницу из массива rows (без DOM парсинга)
 * Каждый row становится отдельным элементом
 */
export async function createPageFromRows(
  rows: import('../../types').CSVRow[],
  options: PageCreationOptions = {}
): Promise<PageCreationResult> {
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
  const query = rows[0]?.['#query'] || rows[0]?.['#OrganicTitle'] || '';

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
// STRUCTURE NODE RENDERING
// ============================================================================

/**
 * Рендерить узел структуры в Figma
 * Возвращает созданный элемент (инстанс или фрейм)
 * @param node - узел структуры
 * @param platform - платформа (desktop/touch)
 * @param errors - массив ошибок для накопления
 * @param parentContainerType - тип родительского контейнера
 * @param query - поисковый запрос (для заголовков)
 */
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

  // Обработка EAsideFilters (боковые фильтры)
  if (node.type === 'EAsideFilters') {
    const panel = await createAsideFiltersPanel(node, platform);
    if (panel) {
      return { element: panel, count: 1 };
    }
    return { element: null, count: 0 };
  }

  // Если это контейнер — создаём фрейм и рендерим детей
  if (isContainerType(node.type)) {
    Logger.debug(`[PageCreator] Container: type=${node.type}, children=${node.children?.length || 0}`);
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
          const titleComponent = await loadComponent(titleConfig.key);
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
            const customTitle = node.children?.[0]?.data?.['#ProductsTilesTitle'];
            const titleText = customTitle
              || (query ? `Популярные товары по запросу «${query}»` : 'Популярные товары');
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

      // === Кнопка «Показать все» под каруселью ===
      const showAllFlag = node.children?.[0]?.data?.['#ProductsTilesShowAll'];
      if (showAllFlag === 'true') {
        try {
          const btnComponent = await loadComponent('d11550f55331ddcb57d6d8e566dc288de8c706d7');
          if (btnComponent) {
            const btnInstance = btnComponent.createInstance();
            // Устанавливаем пропсы: View=Secondary, Size=M, Text=True
            try {
              btnInstance.setProperties({
                'View': 'Secondary',
                'Size': 'M',
                'Text': 'True',
                'Left': false,
                'Right': false,
                'Suffix': false,
              } as Record<string, string | boolean>);
            } catch (e) {
              Logger.debug(`[PageCreator] ShowAll button setProperties: ${e}`);
            }

            // Устанавливаем текст кнопки
            const showAllText = node.children?.[0]?.data?.['#ProductsTilesShowAllText'] || 'Показать все';
            const textNode = findTextNode(btnInstance);
            if (textNode) {
              await figma.loadFontAsync(textNode.fontName as FontName);
              textNode.characters = showAllText;
            }

            wrapper.appendChild(btnInstance);
            btnInstance.layoutSizingHorizontal = 'FILL';

            Logger.debug(`[PageCreator] Кнопка «${showAllText}» добавлена в ProductsTiles`);
          }
        } catch (e) {
          Logger.debug(`[PageCreator] Не удалось создать ShowAll кнопку: ${e}`);
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
          const titleComponent = await loadComponent(titleConfig.key);
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
          const titleComponent = await loadComponent(titleConfig.key);
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
          const isProductsTilesOnTouch = platform === 'touch' && (thisContainerType as ContainerType) === 'ProductsTiles';

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
 *   │       ├── content__aside (vertical, 230px, hug) — боковые фильтры (опционально)
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
  rows: import('../../types').CSVRow[],
  options: {
    query?: string;
    platform?: 'desktop' | 'touch';
    contentLeftWidth?: number;
    contentGap?: number;
    leftPadding?: number;
    wizards?: import('../../types/wizard-types').WizardPayload[];
  } = {}
): Promise<PageCreationResult> {
  const startTime = Date.now();
  const errors: PageCreationError[] = [];
  let createdCount = 0;

  const platform = options.platform || 'desktop';
  const isTouch = platform === 'touch';
  const query = options.query || rows[0]?.['#query'] || rows[0]?.['#OrganicTitle'] || 'query';
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
      const headerComponent = await loadComponent(headerConfig.key);
      if (headerComponent) {
        const headerInstance = headerComponent.createInstance();

        Logger.debug(`[PageCreator] Header: isTouch=${isTouch}, platform=${platform}`);

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
            Logger.debug('[PageCreator] Header: Desktop="False" установлено');
          } catch (e1) {
            Logger.warn(`[PageCreator] Header Desktop="False" failed: ${e1}`);
          }

          headerWrapper.appendChild(headerInstance);
          headerInstance.layoutSizingHorizontal = 'FILL';
        } else {
          // Desktop: Header напрямую в pageFrame
          Logger.debug('[PageCreator] Header: Desktop="True" (по умолчанию)');
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
            Logger.warn(`[PageCreator] Could not find query text node in Header`);
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
    // Desktop: с боковыми фильтрами — left padding 64, без — стандартный
    const hasAside = structure.contentAside.length > 0;
    const effectiveLeftPadding = hasAside ? 64 : leftPadding;
    mainContent.itemSpacing = contentGap;
    mainContent.paddingTop = 0;
    mainContent.paddingRight = 0;
    mainContent.paddingBottom = 0;
    mainContent.paddingLeft = effectiveLeftPadding;
  }

  mainCenter.appendChild(mainContent);
  mainContent.layoutSizingHorizontal = 'FILL';

  // Контейнер для сниппетов (для touch — сам mainContent, для desktop — content__left)
  let snippetsContainer: FrameNode;

  if (isTouch) {
    // Touch: элементы складываем прямо в main__content
    snippetsContainer = mainContent;
  } else {
    // Desktop: создаём content__aside (если есть) + content__left + content__right

    // === 4b. content__aside (боковые фильтры, слева от content__left) ===
    if (structure.contentAside.length > 0) {
      const contentAsideFrame = figma.createFrame();
      contentAsideFrame.name = 'content__aside';
      contentAsideFrame.layoutMode = 'VERTICAL';
      contentAsideFrame.primaryAxisSizingMode = 'AUTO';
      contentAsideFrame.counterAxisSizingMode = 'FIXED';
      contentAsideFrame.resize(200, 100);
      contentAsideFrame.itemSpacing = 0;
      contentAsideFrame.paddingTop = 0;
      contentAsideFrame.paddingRight = 0;
      contentAsideFrame.paddingBottom = 0;
      contentAsideFrame.paddingLeft = 16;
      contentAsideFrame.fills = [];
      mainContent.appendChild(contentAsideFrame);

      for (var ai = 0; ai < structure.contentAside.length; ai++) {
        var asideNode = structure.contentAside[ai];
        var asideResult = await renderStructureNode(asideNode, platform, errors);
        if (asideResult.element) {
          contentAsideFrame.appendChild(asideResult.element);
          if (asideResult.element.type === 'FRAME' || asideResult.element.type === 'INSTANCE') {
            (asideResult.element as FrameNode | InstanceNode).layoutSizingHorizontal = 'FILL';
          }
          createdCount += asideResult.count;
        }
      }

      Logger.debug('[PageCreator] content__aside добавлен с ' + structure.contentAside.length + ' элементами');
    }

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
    contentLeftFrame.clipsContent = false;
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
  const totalNodes = sortedNodes.length;

  for (var ni = 0; ni < sortedNodes.length; ni++) {
    var node = sortedNodes[ni];

    // Progress: 10–90% proportional to node index
    var pct = 10 + Math.round((ni / Math.max(totalNodes, 1)) * 80);
    figma.ui.postMessage({
      type: 'progress',
      current: pct,
      total: 100,
      message: 'Сниппет ' + (ni + 1) + '/' + totalNodes + ' (' + node.type + ')',
      operationType: 'relay-import'
    });

    const result = await renderStructureNode(node, platform, errors, undefined, String(query));

    if (result.element) {
      // Touch: EQuickFilters добавляем в headerWrapper вместо snippetsContainer
      if (isTouch && node.type === 'EQuickFilters' && headerWrapper) {
        headerWrapper.appendChild(result.element);
        if (result.element.type === 'FRAME' || result.element.type === 'INSTANCE') {
          (result.element as FrameNode | InstanceNode).layoutSizingHorizontal = 'FILL';
        }
      } else if (!isTouch && node.type === 'EQuickFilters') {
        // Desktop: EQuickFilters goes into main__center above main__content
        const mcIndex = mainCenter.children.indexOf(mainContent);
        if (mcIndex >= 0) {
          mainCenter.insertChild(mcIndex, result.element);
        } else {
          mainCenter.insertChild(0, result.element);
        }
        if (result.element.type === 'FRAME' || result.element.type === 'INSTANCE') {
          (result.element as FrameNode | InstanceNode).layoutSizingHorizontal = 'FILL';
        }
        if (result.element.type === 'FRAME') {
          // С боковой колонкой фильтров — 80px, без неё — 110px (выравнивание по контенту)
          (result.element as FrameNode).paddingLeft = structure.contentAside.length > 0 ? 80 : 110;
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
      const footerComponent = await loadComponent(footerConfig.key);
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

  // Ошибки по типам (declared before try so it's available in debugReport below)
  const errorsByType: Record<string, string[]> = {};

  // === Debug Frame ===
  try {
    const debugFrame = figma.createFrame();
    debugFrame.name = '__contentify_debug__';
    debugFrame.visible = false;
    debugFrame.resize(1, 1);
    debugFrame.fills = [];
    pageFrame.appendChild(debugFrame);

    const debugLines = [
      'operation: build-page',
      'query: ' + (options.query || '?'),
      'platform: ' + platform,
      'nodes: ' + structure.stats.totalSnippets + ' snippets, ' + structure.stats.containers + ' containers',
      'created: ' + createdCount + ' elements in ' + creationTime + 'ms'
    ];
    for (let ei = 0; ei < errors.length; ei++) {
      const err = errors[ei];
      if (!errorsByType[err.elementType]) errorsByType[err.elementType] = [];
      errorsByType[err.elementType].push(err.message);
    }
    for (const etype in errorsByType) {
      if (Object.prototype.hasOwnProperty.call(errorsByType, etype)) {
        const msgs = errorsByType[etype];
        const uniqueMsgs = Array.from(new Set(msgs));
        debugLines.push('[' + etype + '] errors(' + msgs.length + '): ' + uniqueMsgs.join('; '));
      }
    }

    // Типы созданных нод
    let nodeTypes: Record<string, number> = {};
    if (structure.stats.byType) {
      nodeTypes = structure.stats.byType;
    }
    for (const nt in nodeTypes) {
      if (Object.prototype.hasOwnProperty.call(nodeTypes, nt)) {
        debugLines.push('[' + nt + '] x ' + nodeTypes[nt]);
      }
    }

    debugLines.push('errors_total: ' + errors.length);

    for (let di = 0; di < debugLines.length; di++) {
      const lineFrame = figma.createFrame();
      lineFrame.name = debugLines[di];
      lineFrame.resize(1, 1);
      lineFrame.fills = [];
      debugFrame.appendChild(lineFrame);
    }
  } catch (debugErr) {
    Logger.debug('[PageCreator] Debug frame creation failed');
  }

  // === Debug Report (sent to UI → relay) ===
  const debugReport = {
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
