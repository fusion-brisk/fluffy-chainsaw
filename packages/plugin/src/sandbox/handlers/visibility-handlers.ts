/**
 * Visibility handlers — show/hide logic for groups and blocks
 *
 * Handles:
 * - HidePriceBlock (catalog pages without price)
 * - EcomMeta visibility based on data presence
 * - EmptyGroups — auto-hide groups with all children hidden
 */

import { Logger } from '../../logger';
import { trySetProperty } from '../property-utils';
import {
  getGroupsSortedByDepth,
  shouldProcessGroupForEmptyCheck,
  areAllChildrenHidden,
  hasAnyVisibleChild,
} from '../../utils/instance-cache';
import { HandlerContext } from './types';
import { CSVRow } from '../../types/csv-fields';

/**
 * Safely sets visibility on a frame, detecting and rolling back if it causes
 * a boolean property sync on the container instance.
 *
 * Figma bidirectionally syncs boolean properties with layer visibility.
 * Setting frame.visible directly can flip a boolean property on the parent,
 * undoing schema engine work. This function detects the side effect and reverts.
 *
 * @returns true if visibility was set, false if rolled back due to boolean sync
 */
function safeSetVisible(frame: SceneNode, visible: boolean, container: BaseNode): boolean {
  if (container.type !== 'INSTANCE') {
    frame.visible = visible;
    return true;
  }
  const inst = container as InstanceNode;

  // Snapshot boolean property values before change
  const boolsBefore: Record<string, boolean> = {};
  const props = inst.componentProperties;
  for (const key in props) {
    if (props[key].type === 'BOOLEAN') {
      boolsBefore[key] = props[key].value as boolean;
    }
  }

  // Apply visibility change
  frame.visible = visible;

  // Check if any boolean property was affected
  const propsAfter = inst.componentProperties;
  for (const key in boolsBefore) {
    if ((propsAfter[key].value as boolean) !== boolsBefore[key]) {
      // Side effect detected — revert visibility and restore boolean
      frame.visible = !visible;
      try {
        inst.setProperties({ [key]: boolsBefore[key] });
      } catch (_e) {
        /* best effort */
      }
      Logger.debug(
        '[EmptyGroups] Skipped "' +
          frame.name +
          '": boolean sync detected (' +
          key.split('#')[0] +
          ')',
      );
      return false;
    }
  }

  return true;
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

  Logger.debug(
    `💰 [hidePriceBlock] ВХОД: container="${containerName}", row=${hasRow ? 'да' : 'НЕТ'}, #hidePriceBlock=${hidePriceBlockValue || 'N/A'}`,
  );

  if (!container || !row) return;

  const hidePriceBlock = row['#hidePriceBlock'] === 'true';
  if (!hidePriceBlock) return;

  // Скрываем Price Block через withPrice property на контейнере
  const instance = container.type === 'INSTANCE' ? container : null;
  if (instance) {
    const result = trySetProperty(
      instance,
      ['withPrice', 'PRICE', 'Price'],
      false,
      '#hidePriceBlock',
    );
    if (result) {
      Logger.debug(`   💰 [PriceBlock] Скрыт через withPrice (страница каталога)`);
    }
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
  const hasData = ecomMetaFields.some((field) => {
    const value = row[field as keyof CSVRow];
    return value !== undefined && value !== null && value !== '' && value !== 'false';
  });

  // withDeliveryBnpl управляет только ShopInfo-DeliveryBnplContainer,
  // не всей группой EcomMeta — устанавливаем, но НЕ делаем return
  if (container.type === 'INSTANCE' && !container.removed) {
    const propSet = trySetProperty(
      container as InstanceNode,
      ['withDeliveryBnpl', 'withEcomMeta'],
      hasData,
      '#withDeliveryBnpl',
    );
    if (propSet) {
      Logger.debug(
        `📦 [EcomMetaVisibility] withDeliveryBnpl=${hasData} via property on "${containerName}"`,
      );
    }
  }

  // Всегда проверяем EcomMeta напрямую — скрываем если все дети hidden
  const ecomMeta = instanceCache.groups.get('EcomMeta');

  if (!ecomMeta || ecomMeta.removed) {
    Logger.debug(`📦 [EcomMetaVisibility] EcomMeta не найден или удалён в "${containerName}"`);
    return;
  }

  // Проверяем фактическую видимость детей (а не только наличие данных)
  const allChildrenHidden = areAllChildrenHidden(ecomMeta);

  Logger.debug(
    `📦 [EcomMetaVisibility] hasData=${hasData}, allChildrenHidden=${allChildrenHidden}, visible=${ecomMeta.visible}`,
  );

  if (allChildrenHidden && ecomMeta.visible) {
    safeSetVisible(ecomMeta, false, container);
    Logger.debug(`📦 [EcomMetaVisibility] Скрыт EcomMeta (все дети скрыты)`);
  } else if (!allChildrenHidden && !ecomMeta.visible) {
    safeSetVisible(ecomMeta, true, container);
    Logger.debug(`📦 [EcomMetaVisibility] Показан EcomMeta (есть видимые дети)`);
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
        if (safeSetVisible(group, false, container)) {
          hiddenCount++;
        }
      } else if (hasVisible && !group.visible) {
        if (safeSetVisible(group, true, container)) {
          shownCount++;
        }
      }
    } catch (_e) {
      Logger.debug('[EmptyGroups] Group visibility toggle failed: ' + group.name);
    }
  }

  if (hiddenCount > 0 || shownCount > 0) {
    Logger.debug(`📦 [EmptyGroups] Скрыто ${hiddenCount}, показано ${shownCount} групп`);
  }
}
