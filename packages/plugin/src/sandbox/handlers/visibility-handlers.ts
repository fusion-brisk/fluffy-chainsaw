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
  hasAnyVisibleChild
} from '../../utils/instance-cache';
import { HandlerContext } from './types';
import { CSVRow } from '../../types/csv-fields';

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
      Logger.debug('[EmptyGroups] Group visibility toggle failed: ' + group.name);
    }
  }

  if (hiddenCount > 0 || shownCount > 0) {
    Logger.debug(`📦 [EmptyGroups] Скрыто ${hiddenCount}, показано ${shownCount} групп`);
  }
}
