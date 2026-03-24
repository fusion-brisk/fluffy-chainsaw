/**
 * Panel Builders — создание специализированных панелей (фильтры, сетка картинок, контейнеры)
 */

import { Logger } from '../../logger';
import { findTextNode, findFirstNodeByName } from '../../utils/node-search';
import {
  FILTER_COMPONENTS,
  ASIDE_FILTER_COMPONENTS,
  VARIABLE_KEYS,
  ETHUMB_CONFIG,
  LAYOUT_COMPONENT_MAP,
  getContainerConfig,
} from './component-map';
import { loadComponent } from './component-import';
import { applyFill, applyFillStyle } from './fill-utils';
import { loadAndApplyImage, findFillableLayer, findImageLayer } from './image-operations';
import type { ImageGridItem } from './image-operations';
import type { StructureNode, ContainerType, ContainerConfig } from './types';

/**
 * Создать Auto Layout фрейм-контейнер
 */
export function createContainerFrame(config: ContainerConfig): FrameNode {
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
 * Создаёт панель быстрых фильтров EQuickFilters
 */
export async function createEQuickFiltersPanel(
  node: StructureNode,
  _platform: 'desktop' | 'touch'
): Promise<FrameNode | null> {
  const data = (node.data || {}) as Record<string, string | undefined>;
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
            Logger.debug(`[EQuickFilters] "${text}" variant: View=${viewValue}`);
          } catch (e) {
            Logger.error(`[EQuickFilters] Ошибка установки variant свойств:`, e);
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
              Logger.debug(`[EQuickFilters] "${text}" boolean: Right=${rightValue}`);
            }
          } catch (e) {
            Logger.error(`[EQuickFilters] Ошибка установки boolean свойств:`, e);
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
 * Применить defaultBooleans из конфига к инстансу.
 * Ключи в config — без хэш-суффикса (например 'Show Sufix'),
 * в componentProperties они идут как 'Show Sufix#4118:2'.
 */
export function applyDefaultBooleans(
  instance: InstanceNode,
  booleans: Record<string, boolean>
): void {
  try {
    var props = instance.componentProperties;
    var toSet: Record<string, boolean> = {};
    for (var propKey in props) {
      if (props[propKey].type !== 'BOOLEAN') continue;
      var baseName = propKey.split('#')[0];
      if (baseName in booleans) {
        toSet[propKey] = booleans[baseName];
      }
    }
    if (Object.keys(toSet).length > 0) {
      instance.setProperties(toSet);
    }
  } catch (e) {
    Logger.debug('[EAsideFilters] Ошибка установки boolean свойств: ' + e);
  }
}

/**
 * Создаёт панель боковых фильтров EAsideFilters
 */
export async function createAsideFiltersPanel(
  node: StructureNode,
  _platform: 'desktop' | 'touch'
): Promise<FrameNode | null> {
  const data = (node.data || {}) as Record<string, string | undefined>;
  const jsonStr = data['#AsideFilters_data'];
  if (!jsonStr) {
    Logger.debug('[EAsideFilters] Нет данных #AsideFilters_data');
    return null;
  }

  let parsed: { filters: Array<{
    title: string;
    type: string;
    items?: string[];
    placeholderFrom?: string;
    placeholderTo?: string;
    hasMore?: boolean;
  }> };

  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    Logger.warn('[EAsideFilters] Ошибка парсинга JSON: ' + e);
    return null;
  }

  if (!parsed.filters || parsed.filters.length === 0) {
    Logger.debug('[EAsideFilters] Нет фильтров');
    return null;
  }

  Logger.info('[EAsideFilters] Создаём панель с ' + parsed.filters.length + ' фильтрами');

  // Pre-load all needed components via ComponentSet + variant matching
  var titleComponent: ComponentNode | null = null;
  var checkboxComponent: ComponentNode | null = null;
  var categoryComponent: ComponentNode | null = null;
  var numberInputComponent: ComponentNode | null = null;

  var asideEntries: Array<{
    name: string;
    config: { setKey: string; variantProps: Record<string, string> };
  }> = [
    { name: 'SectionTitle', config: ASIDE_FILTER_COMPONENTS.SectionTitle },
    { name: 'EnumFilterItem', config: ASIDE_FILTER_COMPONENTS.EnumFilterItem },
    { name: 'CategoryItem', config: ASIDE_FILTER_COMPONENTS.CategoryItem },
    { name: 'NumberInput', config: ASIDE_FILTER_COMPONENTS.NumberInput },
  ];
  var componentResults: (ComponentNode | null)[] = [null, null, null, null];

  for (var ci2 = 0; ci2 < asideEntries.length; ci2++) {
    var entry = asideEntries[ci2];
    var importedComponent: ComponentNode | null = null;

    // Strategy 1: load as ComponentSet and find variant
    try {
      var compSet = await figma.importComponentSetByKeyAsync(entry.config.setKey);
      if (compSet) {
        var variant: ComponentNode | null = null;
        for (var vi = 0; vi < compSet.children.length; vi++) {
          var child = compSet.children[vi];
          if (child.type !== 'COMPONENT') continue;
          var variantValues = (child as ComponentNode).variantProperties;
          if (!variantValues) continue;
          var match = true;
          for (var vpKey in entry.config.variantProps) {
            if (variantValues[vpKey] !== (entry.config.variantProps as Record<string, string>)[vpKey]) {
              match = false;
              break;
            }
          }
          if (match) {
            variant = child as ComponentNode;
            break;
          }
        }
        if (variant) {
          importedComponent = variant;
          Logger.debug('[EAsideFilters] Импортирован ' + entry.name + ' (variant=' + variant.name + ')');
        } else if (compSet.children.length > 0 && compSet.children[0].type === 'COMPONENT') {
          importedComponent = compSet.children[0] as ComponentNode;
          Logger.warn('[EAsideFilters] Variant не найден для ' + entry.name + ', используем default: ' + compSet.children[0].name);
        }
      }
    } catch (_e1) {
      var errMsg1 = _e1 instanceof Error ? _e1.message : String(_e1);
      Logger.warn('[EAsideFilters] importComponentSetByKeyAsync failed for ' + entry.name + ': ' + errMsg1);
    }

    // Strategy 2: key might be a component key directly (not a set)
    if (!importedComponent) {
      try {
        importedComponent = await figma.importComponentByKeyAsync(entry.config.setKey);
        if (importedComponent) {
          Logger.debug('[EAsideFilters] Импортирован ' + entry.name + ' напрямую (key=' + entry.config.setKey + ')');
        }
      } catch (_e2) {
        var errMsg2 = _e2 instanceof Error ? _e2.message : String(_e2);
        Logger.error('[EAsideFilters] Не удалось импортировать ' + entry.name + ' (key=' + entry.config.setKey + '): ' + errMsg2);
      }
    }

    componentResults[ci2] = importedComponent;
  }

  titleComponent = componentResults[0];
  checkboxComponent = componentResults[1];
  categoryComponent = componentResults[2];
  numberInputComponent = componentResults[3];

  const panel = figma.createFrame();
  panel.name = 'EAsideFilters';
  panel.layoutMode = 'VERTICAL';
  panel.primaryAxisSizingMode = 'AUTO';
  panel.counterAxisSizingMode = 'FIXED';
  panel.resize(230, 100);
  panel.itemSpacing = 0;
  panel.paddingTop = 0;
  panel.paddingRight = 0;
  panel.paddingBottom = 0;
  panel.paddingLeft = 0;
  panel.fills = [];

  for (var fi = 0; fi < parsed.filters.length; fi++) {
    var filter = parsed.filters[fi];
    var section = figma.createFrame();
    section.name = 'EAsideFilters-Item_' + filter.type;
    section.layoutMode = 'VERTICAL';
    section.primaryAxisSizingMode = 'AUTO';
    section.counterAxisSizingMode = 'AUTO';
    section.itemSpacing = 8;
    section.paddingTop = 16;
    section.paddingRight = 0;
    section.paddingBottom = 16;
    section.paddingLeft = 0;
    section.fills = [];

    // Title — library component or fallback text
    if (titleComponent) {
      var titleInst = titleComponent.createInstance();
      titleInst.name = 'EAsideFilters-Title';
      if (ASIDE_FILTER_COMPONENTS.SectionTitle.defaultBooleans) {
        applyDefaultBooleans(titleInst, ASIDE_FILTER_COMPONENTS.SectionTitle.defaultBooleans);
      }
      // Boolean toggle filters get ACTION ICON = true
      if (filter.type === 'boolean') {
        try {
          var actionIconProps: Record<string, boolean> = {};
          var allTitleProps = titleInst.componentProperties;
          for (var aik in allTitleProps) {
            if (allTitleProps[aik].type !== 'BOOLEAN') continue;
            if (aik.split('#')[0] === 'ACTION ICON') {
              actionIconProps[aik] = true;
              break;
            }
          }
          if (Object.keys(actionIconProps).length > 0) {
            titleInst.setProperties(actionIconProps);
          }
        } catch (_eAction) {
          Logger.debug('[EAsideFilters] Ошибка установки ACTION ICON: ' + _eAction);
        }
      }
      // Set title via exposed TEXT property 'titleText', fallback to findTextNode
      var titleProps = titleInst.componentProperties;
      var titleTextPropKey: string | null = null;
      for (var tpk in titleProps) {
        if (titleProps[tpk].type === 'TEXT' && tpk.split('#')[0] === 'titleText') {
          titleTextPropKey = tpk;
          break;
        }
      }
      if (titleTextPropKey) {
        titleInst.setProperties({ [titleTextPropKey]: filter.title });
      } else {
        var titleTextNode = findTextNode(titleInst);
        if (titleTextNode) {
          await figma.loadFontAsync(titleTextNode.fontName as FontName);
          titleTextNode.characters = filter.title;
        }
      }
      section.appendChild(titleInst);
      titleInst.layoutSizingHorizontal = 'FILL';
    } else {
      var titleFallback = figma.createText();
      await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
      titleFallback.fontName = { family: 'Inter', style: 'Bold' };
      titleFallback.fontSize = 14;
      titleFallback.characters = filter.title;
      titleFallback.name = 'EAsideFilters-Title';
      section.appendChild(titleFallback);
    }

    if (filter.type === 'categories' && filter.items) {
      // Category items — library component or fallback text
      for (var ci = 0; ci < filter.items.length; ci++) {
        if (categoryComponent) {
          var catInst = categoryComponent.createInstance();
          catInst.name = 'ECategories-Item';
          var catTextNode = findTextNode(catInst);
          if (catTextNode) {
            await figma.loadFontAsync(catTextNode.fontName as FontName);
            catTextNode.characters = filter.items[ci];
          }
          section.appendChild(catInst);
          catInst.layoutSizingHorizontal = 'FILL';
        } else {
          var catFallback = figma.createText();
          await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
          catFallback.fontName = { family: 'Inter', style: 'Regular' };
          catFallback.fontSize = 13;
          catFallback.characters = filter.items[ci];
          catFallback.name = 'ECategories-Text';
          section.appendChild(catFallback);
        }
      }
    } else if (filter.type === 'number') {
      // Number range — vertical group, inputs fill width
      var inputGroup = figma.createFrame();
      inputGroup.name = 'ENumberInputGroup';
      inputGroup.layoutMode = 'VERTICAL';
      inputGroup.primaryAxisSizingMode = 'AUTO';
      inputGroup.counterAxisSizingMode = 'AUTO';
      inputGroup.itemSpacing = 8;
      inputGroup.fills = [];

      var placeholders = [
        { label: 'от', value: filter.placeholderFrom || '' },
        { label: 'до', value: filter.placeholderTo || '' },
      ];

      for (var ni = 0; ni < placeholders.length; ni++) {
        if (numberInputComponent) {
          var inputInst = numberInputComponent.createInstance();
          inputInst.name = 'ENumberInput-' + placeholders[ni].label;
          if (ASIDE_FILTER_COMPONENTS.NumberInput.defaultBooleans) {
            applyDefaultBooleans(inputInst, ASIDE_FILTER_COMPONENTS.NumberInput.defaultBooleans);
          }
          // Find text inside "label" sublayer for placeholder
          var labelNode = findFirstNodeByName(inputInst, 'label');
          var labelTextNode = labelNode ? findTextNode(labelNode) : findTextNode(inputInst);
          if (labelTextNode) {
            await figma.loadFontAsync(labelTextNode.fontName as FontName);
            labelTextNode.characters = placeholders[ni].value;
          }
          inputGroup.appendChild(inputInst);
          inputInst.layoutSizingHorizontal = 'FILL';
        } else {
          var inputFallback = figma.createText();
          await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
          inputFallback.fontName = { family: 'Inter', style: 'Regular' };
          inputFallback.fontSize = 13;
          inputFallback.characters = placeholders[ni].label + ' ' + placeholders[ni].value;
          inputFallback.name = 'ENumberInput-' + placeholders[ni].label;
          inputGroup.appendChild(inputFallback);
        }
      }

      section.appendChild(inputGroup);
      inputGroup.layoutSizingHorizontal = 'FILL';
    } else if (filter.type === 'enum' && filter.items) {
      // Enum items — checkbox components or fallback text
      for (var ei = 0; ei < filter.items.length; ei++) {
        if (checkboxComponent) {
          var checkInst = checkboxComponent.createInstance();
          checkInst.name = 'EEnumFilterItem';
          if (ASIDE_FILTER_COMPONENTS.EnumFilterItem.defaultBooleans) {
            applyDefaultBooleans(checkInst, ASIDE_FILTER_COMPONENTS.EnumFilterItem.defaultBooleans);
          }
          var checkTextNode = findTextNode(checkInst);
          if (checkTextNode) {
            await figma.loadFontAsync(checkTextNode.fontName as FontName);
            checkTextNode.characters = filter.items[ei];
          }
          section.appendChild(checkInst);
          checkInst.layoutSizingHorizontal = 'FILL';
        } else {
          var enumFallback = figma.createText();
          await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
          enumFallback.fontName = { family: 'Inter', style: 'Regular' };
          enumFallback.fontSize = 13;
          enumFallback.characters = filter.items[ei];
          enumFallback.name = 'EEnumFilterItem';
          section.appendChild(enumFallback);
        }
      }

      // «Ещё» button — text with tertiary color (no library component)
      if (filter.hasMore) {
        var moreNode = figma.createText();
        try {
          await figma.loadFontAsync({ family: 'YS Text Web', style: 'Regular' });
          moreNode.fontName = { family: 'YS Text Web', style: 'Regular' };
        } catch (_e) {
          await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
          moreNode.fontName = { family: 'Inter', style: 'Regular' };
        }
        moreNode.fontSize = 14;
        moreNode.lineHeight = { value: 18, unit: 'PIXELS' };
        moreNode.characters = 'Ещё';
        moreNode.name = 'EAsideFilters-Expand';
        try {
          var tertiaryVar = await figma.variables.importVariableByKeyAsync(
            VARIABLE_KEYS['Text and Icon/Tertiary']
          );
          if (tertiaryVar) {
            var basePaint: SolidPaint = { type: 'SOLID', color: { r: 0, g: 0, b: 0 } };
            var boundPaint = figma.variables.setBoundVariableForPaint(basePaint, 'color', tertiaryVar);
            moreNode.fills = [boundPaint];
          }
        } catch (_e2) {
          Logger.debug('[EAsideFilters] Не удалось применить цвет Tertiary: ' + _e2);
        }
        section.appendChild(moreNode);
      }
    }

    // border-bottom on all sections except the last
    if (fi < parsed.filters.length - 1) {
      try {
        var strokeVar = await figma.variables.importVariableByKeyAsync(
          VARIABLE_KEYS['Applied/Stroke']
        );
        if (strokeVar) {
          var strokePaint: SolidPaint = { type: 'SOLID', color: { r: 0, g: 0, b: 0 } };
          var boundStroke = figma.variables.setBoundVariableForPaint(strokePaint, 'color', strokeVar);
          section.strokes = [boundStroke];
        } else {
          section.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.88 } }];
        }
      } catch (_eStroke) {
        section.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.88 } }];
      }
      section.strokeBottomWeight = 1;
      section.strokeTopWeight = 0;
      section.strokeLeftWeight = 0;
      section.strokeRightWeight = 0;
    }

    panel.appendChild(section);
    section.layoutSizingHorizontal = 'FILL';
  }

  Logger.info('[EAsideFilters] Создано ' + parsed.filters.length + ' секций фильтров');
  return panel;
}

/**
 * Создаёт панель ImagesGrid — justified grid из EThumb инстансов
 */
export async function createImagesGridPanel(
  node: StructureNode,
  _platform: 'desktop' | 'touch'
): Promise<{ element: FrameNode; count: number } | null> {
  const data = node.data || (node.children && node.children[0] && node.children[0].data) || {};
  const imagesJson = data['#ImagesGrid_data'];
  if (!imagesJson) {
    Logger.warn('[ImagesGrid] Нет данных #ImagesGrid_data');
    return null;
  }

  let images: ImageGridItem[];
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

  const title = data['#ImagesGrid_title'] || 'Картинки';

  // Импортируем EThumb (variant: Type=New; feb-26, Ratio=Manual)
  const eThumbComponent = await loadComponent(ETHUMB_CONFIG.manualVariantKey);
  // EThumb не обязателен — если недоступен, рендерим простые прямоугольники с изображениями

  // === Wrapper frame (VERTICAL) ===
  const wrapper = figma.createFrame();
  wrapper.name = 'ImagesGrid';
  wrapper.layoutMode = 'VERTICAL';
  wrapper.primaryAxisSizingMode = 'AUTO';
  wrapper.counterAxisSizingMode = 'AUTO';
  wrapper.itemSpacing = 12;
  wrapper.fills = [];
  // FILL width устанавливается после appendChild в родитель
  // (layoutSizingHorizontal = 'FILL' требует наличия parent)

  // === Заголовок «Картинки» ===
  const titleConfig = LAYOUT_COMPONENT_MAP['Title'];
  if (titleConfig && titleConfig.key) {
    const titleComponent = await loadComponent(titleConfig.key);
    if (titleComponent) {
      const titleInstance = titleComponent.createInstance();
      wrapper.appendChild(titleInstance);
      titleInstance.layoutSizingHorizontal = 'FILL';

      const textNode = findTextNode(titleInstance);
      if (textNode) {
        try {
          await figma.loadFontAsync(textNode.fontName as FontName);
          textNode.characters = title;
        } catch (e) { Logger.debug('[ImagesGrid] Title text set failed'); }
      }
    }
  }

  // === Grid content (VERTICAL, gap=6 между рядами) ===
  const gridFrame = figma.createFrame();
  gridFrame.name = 'ImagesGridContent';
  gridFrame.layoutMode = 'VERTICAL';
  gridFrame.primaryAxisSizingMode = 'AUTO';
  gridFrame.counterAxisSizingMode = 'AUTO';
  gridFrame.itemSpacing = 6;
  gridFrame.fills = [];
  wrapper.appendChild(gridFrame);

  // Группируем по рядам
  const rowMap = new Map<number, ImageGridItem[]>();
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    let rowItems = rowMap.get(img.row);
    if (!rowItems) {
      rowItems = [];
      rowMap.set(img.row, rowItems);
    }
    rowItems.push(img);
  }

  let count = 0;

  // Создаём ряды
  const rowIndices = Array.from(rowMap.keys()).sort();
  for (let ri = 0; ri < rowIndices.length; ri++) {
    const rowIndex = rowIndices[ri];
    const rowImages = rowMap.get(rowIndex)!;

    // Row frame (HORIZONTAL, gap=6)
    const rowFrame = figma.createFrame();
    rowFrame.name = 'ImagesGridRow-' + rowIndex;
    rowFrame.layoutMode = 'HORIZONTAL';
    rowFrame.primaryAxisSizingMode = 'AUTO';
    rowFrame.counterAxisSizingMode = 'AUTO';
    rowFrame.itemSpacing = 6;
    rowFrame.fills = [];
    gridFrame.appendChild(rowFrame);

    // Создаём изображения (EThumb instances или canvas rectangles)
    for (let j = 0; j < rowImages.length; j++) {
      const imageItem = rowImages[j];
      const imgW = Math.round(imageItem.width) || 120;
      const imgH = Math.round(imageItem.height) || 120;

      if (eThumbComponent) {
        // Level 1: Library EThumb
        const instance = eThumbComponent.createInstance();
        rowFrame.appendChild(instance);
        try { instance.setProperties(ETHUMB_CONFIG.gridDefaults); } catch (_e) { /* skip */ }
        try { instance.resize(imgW, imgH); } catch (_e) { /* skip */ }

        if (imageItem.url) {
          const imageLayer = findFillableLayer(instance, 'image');
          if (imageLayer) {
            await loadAndApplyImage(imageLayer, imageItem.url, '[ImagesGrid]');
          } else {
            await loadAndApplyImage(instance, imageItem.url, '[ImagesGrid]');
          }
        }
      } else {
        // Level 3: Canvas fallback — simple rectangle with image fill
        const rect = figma.createRectangle();
        rect.name = 'Image';
        rect.resize(imgW, imgH);
        rect.cornerRadius = 8;
        rect.fills = [{ type: 'SOLID', color: { r: 0.93, g: 0.93, b: 0.93 } }];
        rowFrame.appendChild(rect);

        if (imageItem.url) {
          await loadAndApplyImage(rect, imageItem.url, '[ImagesGrid]');
        }
      }

      count++;
    }
  }

  Logger.debug('[ImagesGrid] Создано ' + count + ' картинок в ' + rowIndices.length + ' рядах');
  return { element: wrapper, count: count };
}
