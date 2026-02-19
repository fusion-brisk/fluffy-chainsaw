/**
 * Schema Engine — generic движок для применения декларативных схем
 *
 * Заменяет императивные handlers для типов контейнеров, описанных через ComponentSchema.
 * Использует существующие trySetProperty и getCachedInstance.
 */

import { Logger } from '../logger';
import { trySetProperty } from '../property-utils';
import { getCachedInstance, DeepCache } from '../utils/instance-cache';
import type { CSVRow } from '../types/csv-fields';
import type { ComponentSchema, PropertyMapping } from './types';

// Temporary debug log for schema engine
export var schemaDebugLog: string[] = [];

/**
 * Вычисляет значение PropertyMapping из данных строки.
 * @returns boolean | string — значение для trySetProperty, или null если пропустить
 */
function resolveValue(
  mapping: PropertyMapping,
  row: CSVRow,
  container: InstanceNode,
  cache: DeepCache
): boolean | string | null {
  // Priority 1: compute
  if (mapping.compute) {
    return mapping.compute(row, container, cache);
  }

  // Priority 2: equals
  if (mapping.equals) {
    return row[mapping.equals.field] === mapping.equals.value;
  }

  // Priority 3: hasValue (truthy presence)
  if (mapping.hasValue) {
    return !!((row[mapping.hasValue] || '') as string).trim();
  }

  // Priority 4: stringValue (pass-through)
  if (mapping.stringValue) {
    var val = ((row[mapping.stringValue] || '') as string).trim();
    if (mapping.skipIfEmpty && !val) return null;
    return val;
  }

  return null;
}

/**
 * Применяет список PropertyMapping к целевому инстансу.
 */
function applyProperties(
  target: InstanceNode,
  mappings: PropertyMapping[],
  row: CSVRow,
  container: InstanceNode,
  cache: DeepCache,
  logPrefix: string
): void {
  for (var i = 0; i < mappings.length; i++) {
    var mapping = mappings[i];
    var value = resolveValue(mapping, row, container, cache);

    if (value === null) continue;

    var result = trySetProperty(
      target,
      mapping.propertyNames,
      value,
      mapping.fieldName
    );

    // Collect debug info for key properties
    if (mapping.propertyNames[0] === 'withPromo' || mapping.propertyNames[0] === 'withSitelinks' || mapping.propertyNames[0] === 'organicPath') {
      schemaDebugLog.push(mapping.propertyNames[0] + '=' + String(value) + '(type=' + typeof value + ') result=' + result + ' target=' + target.name);
    }

    Logger.debug(
      '   ' + logPrefix + ' ' + mapping.propertyNames[0] + '=' + String(value) + ', result=' + result
    );
  }
}

/**
 * Применяет ComponentSchema к контейнеру.
 *
 * @param container — Figma-инстанс контейнера (EShopItem, EOfferItem, ...)
 * @param row — строка данных CSVRow
 * @param schema — декларативная схема маппинга
 * @param cache — DeepCache с кэшированными вложенными инстансами
 */
export function applySchema(
  container: InstanceNode,
  row: CSVRow,
  schema: ComponentSchema,
  cache: DeepCache
): void {
  if (!container || !row || container.removed) return;

  var containerName = container.name || 'Unknown';
  Logger.debug('[Schema] Applying ' + schema.containerNames[0] + ' schema to "' + containerName + '"');

  // 1. Свойства контейнера
  applyProperties(
    container,
    schema.containerProperties,
    row,
    container,
    cache,
    '[' + containerName + ']'
  );

  // 2. Свойства вложенных инстансов
  for (var i = 0; i < schema.nestedInstances.length; i++) {
    var nested = schema.nestedInstances[i];
    var nestedInstance = getCachedInstance(cache, nested.instanceName);

    if (!nestedInstance) {
      Logger.debug('[Schema] Nested instance "' + nested.instanceName + '" not found');
      continue;
    }

    applyProperties(
      nestedInstance,
      nested.properties,
      row,
      container,
      cache,
      '[' + nested.instanceName + ']'
    );
  }
}
