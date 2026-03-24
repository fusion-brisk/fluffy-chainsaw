/**
 * Instance Factory — создание инстансов компонентов для legacy createPageFromStructure
 */

import { Logger } from '../../logger';
import { handlerRegistry } from '../handlers/registry';
import type { HandlerContext } from '../handlers/types';
import { buildInstanceCache } from '../../utils/instance-cache';
import { getComponentConfig } from './component-map';
import { loadComponent, createPlaceholder } from './component-import';
import type { PageElement, SnippetType } from './types';

/**
 * Создать инстанс компонента для элемента страницы
 */
export async function createInstanceForElement(
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

  const componentKey = (platform === 'touch' && config.keyTouch)
    ? config.keyTouch
    : config.key;

  // Импортируем компонент
  const component = await loadComponent(componentKey);
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
      instance.setProperties(restProps as Record<string, string | boolean>);
      Logger.info(`[PageCreator] ${element.type}: Platform=${platformValue} (из компонента)`);
    } catch (e) {
      Logger.debug(`[PageCreator] Не удалось установить properties: ${e}`);
    }
  }

  return instance;
}

/**
 * Применить данные к инстансу через существующие handlers
 */
export async function applyDataToInstance(
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
export async function createGroupWithChildren(
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
      if ('setProperties' in groupInstance) {
        groupInstance.setProperties({
          [config.itemCountProperty]: String(visibleCount),
        });
      }
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
