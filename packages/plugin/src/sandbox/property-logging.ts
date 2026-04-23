import { Logger } from '../logger';
import {
  findPropertyKey,
  getPropertyMetadata,
  logComponentCacheStats,
  getCachedPropertyNames,
} from '../utils/component-cache';

// ============================================================================
// Кэш предупреждений для агрегации (чтобы не спамить одинаковыми сообщениями)
// ============================================================================
interface PropertyWarning {
  count: number;
  instanceNames: Set<string>;
  availableProperties?: string[]; // Для первой ошибки запоминаем доступные свойства
}

// Ключ: "instanceType:propertyName", значение: статистика
const missingPropertyWarnings: Map<string, PropertyWarning> = new Map();
// Ключ: "instanceType:propertyName:value", значение: статистика ошибок установки
const setPropertyErrors: Map<string, PropertyWarning> = new Map();
// Кэш логирования доступных свойств (чтобы логировать только один раз на тип)
const loggedAvailableProperties: Set<string> = new Set();

// Per-handler field counters (reset before each handler, read after)
let fieldsSetCount = 0;
let fieldsFailedCount = 0;

/** Reset field counters before handler execution */
export function resetFieldCounts(): void {
  fieldsSetCount = 0;
  fieldsFailedCount = 0;
}

/** Get field counters after handler execution */
export function getFieldCounts(): { set: number; failed: number } {
  return { set: fieldsSetCount, failed: fieldsFailedCount };
}

/** Increment the fields-set counter */
export function incrementFieldsSet(): void {
  fieldsSetCount++;
}

/** Increment the fields-failed counter */
export function incrementFieldsFailed(): void {
  fieldsFailedCount++;
}

/**
 * Сбрасывает счётчики предупреждений (вызывать перед обработкой batch)
 */
export function resetPropertyWarnings(): void {
  missingPropertyWarnings.clear();
  setPropertyErrors.clear();
  loggedAvailableProperties.clear();
}

/**
 * Выводит агрегированную статистику предупреждений (вызывать после обработки batch)
 */
export function logPropertyWarnings(): void {
  // Статистика кэша свойств компонентов
  logComponentCacheStats();

  // Предупреждения о ненайденных свойствах
  if (missingPropertyWarnings.size > 0) {
    Logger.verbose(`⚠️ Свойства не найдены в компонентах:`);
    const sorted = Array.from(missingPropertyWarnings.entries()).sort(
      (a, b) => b[1].count - a[1].count,
    );

    for (const [key, stats] of sorted) {
      const [instanceType, propertyName] = key.split(':');
      Logger.verbose(`   "${propertyName}" в ${instanceType}: ${stats.count}×`);
    }
  }

  // Ошибки установки variant properties
  if (setPropertyErrors.size > 0) {
    Logger.verbose(
      `❌ Не удалось установить Variant Properties (свойство не найдено или значение невалидно):`,
    );
    const sorted = Array.from(setPropertyErrors.entries()).sort((a, b) => b[1].count - a[1].count);

    for (const [key, stats] of sorted) {
      const parts = key.split(':');
      const instanceType = parts[0];
      const propertyName = parts[1];
      const value = parts.slice(2).join(':');
      Logger.verbose(`   "${propertyName}=${value}" в ${instanceType}: ${stats.count}×`);
    }
    Logger.verbose(`   💡 Проверьте точные имена свойств в Figma и переименуйте при необходимости`);
  }
}

/**
 * Логирует доступные свойства компонента (один раз для каждого типа)
 */
function logAvailablePropertiesOnce(instance: InstanceNode, propertyName: string): void {
  const instanceType = instance.name.split(' ')[0];
  const logKey = `${instanceType}:${propertyName}`;

  if (loggedAvailableProperties.has(logKey)) {
    return; // Уже логировали для этого типа и свойства
  }
  loggedAvailableProperties.add(logKey);

  const availableProps = getCachedPropertyNames(instance);
  if (availableProps.length > 0) {
    // DEBUG: диагностика для разработчика, не нужна в обычных логах пользователя.
    // Раньше на info — каждый апликованный снипет флудил 6+ строками.
    Logger.debug(`   📋 [${instanceType}] Доступные свойства: ${availableProps.join(', ')}`);
    Logger.debug(`   💡 Искали: "${propertyName}" — не найдено`);
  }
}

/**
 * Регистрирует предупреждение о ненайденном свойстве (не выводит в лог)
 */
export function trackMissingProperty(
  instanceName: string,
  propertyName: string,
  instance?: InstanceNode,
): void {
  // Извлекаем тип инстанса (например, "EProductSnippet" из "EProductSnippet")
  const instanceType = instanceName.split(' ')[0];
  const key = `${instanceType}:${propertyName}`;

  const existing = missingPropertyWarnings.get(key);
  if (existing) {
    existing.count++;
    existing.instanceNames.add(instanceName);
  } else {
    // Первая ошибка для этого типа — логируем доступные свойства
    if (instance) {
      logAvailablePropertiesOnce(instance, propertyName);
    }
    missingPropertyWarnings.set(key, {
      count: 1,
      instanceNames: new Set([instanceName]),
    });
  }
}

/**
 * Регистрирует ошибку установки свойства (не выводит в лог)
 */
export function trackSetPropertyError(
  instanceName: string,
  propertyName: string,
  value: string,
  instance?: InstanceNode,
): void {
  const instanceType = instanceName.split(' ')[0];
  const key = `${instanceType}:${propertyName}:${value}`;

  const existing = setPropertyErrors.get(key);
  if (existing) {
    existing.count++;
    existing.instanceNames.add(instanceName);
  } else {
    // Первая ошибка — логируем метаданные свойства
    if (instance) {
      logPropertyOptionsOnce(instance, propertyName);
    }
    setPropertyErrors.set(key, {
      count: 1,
      instanceNames: new Set([instanceName]),
    });
  }
}

/**
 * Логирует допустимые значения (options) свойства (один раз для каждого типа)
 */
function logPropertyOptionsOnce(instance: InstanceNode, propertyName: string): void {
  const instanceType = instance.name.split(' ')[0];
  const logKey = `options:${instanceType}:${propertyName}`;

  if (loggedAvailableProperties.has(logKey)) {
    return;
  }
  loggedAvailableProperties.add(logKey);

  const foundKey = findPropertyKey(instance, propertyName);
  if (!foundKey) return;

  const metadata = getPropertyMetadata(instance, foundKey);
  if (!metadata) return;

  Logger.info(`   🔧 [${instanceType}] Свойство "${propertyName}" (ключ: "${foundKey}"):`);
  Logger.info(`      - Тип: ${metadata.type}`);
  Logger.info(`      - Текущее значение: ${metadata.defaultValue}`);
  if (metadata.options && metadata.options.length > 0) {
    Logger.info(`      - Допустимые значения: [${metadata.options.join(', ')}]`);
  } else {
    Logger.info(`      - Допустимые значения: НЕ ОПРЕДЕЛЕНЫ (exposed или без ограничений)`);
  }
}
