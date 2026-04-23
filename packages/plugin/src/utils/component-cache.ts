/**
 * Component Properties Cache — кэш структуры свойств компонентов
 * Строится при первой встрече инстанса определённого компонента
 * Цель: O(1) lookup вместо O(n) перебора вариантов имён
 */

import { Logger } from '../logger';

// ============================================================================
// Типы
// ============================================================================

export interface PropertyMetadata {
  key: string; // Полный ключ "Old Price#14715:9"
  simpleName: string; // Простое имя "Old Price"
  type: 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP' | 'EXPOSED_INSTANCE';
  options?: readonly string[]; // Для VARIANT: доступные значения
  defaultValue?: string | boolean;
}

export interface ComponentPropertyInfo {
  // Карта: нормализованное имя → реальный ключ свойства
  propertyNames: { [normalized: string]: string };
  // Карта: ключ свойства → метаданные
  properties: { [key: string]: PropertyMetadata };
}

// ============================================================================
// Глобальный кэш
// ============================================================================

// Кэш свойств: instanceId → PropertyInfo
// Используем let для O(1) очистки через переприсвоение (вместо for...in + delete)
let propertyCache: { [instanceId: string]: ComponentPropertyInfo } = {};

// Статистика использования кэша
let cacheHits = 0;
let cacheMisses = 0;
let totalLookups = 0;

// ============================================================================
// Функции нормализации
// ============================================================================

/**
 * Нормализует имя свойства: убирает пробелы, подчёркивания, дефисы и приводит к нижнему регистру
 * "Old Price" → "oldprice"
 * "old_price" → "oldprice"
 * "old-price" → "oldprice"
 */
function normalizePropertyName(name: string): string {
  return name.toLowerCase().replace(/[\s_-]/g, '');
}

// ============================================================================
// Построение кэша
// ============================================================================

/**
 * Строит кэш свойств для компонента инстанса
 * Вызывается один раз при первой встрече инстанса определённого компонента
 */
function buildPropertyInfo(instance: InstanceNode): ComponentPropertyInfo {
  const propertyNames: { [normalized: string]: string } = {};
  const properties: { [key: string]: PropertyMetadata } = {};

  const componentProperties = instance.componentProperties;
  if (!componentProperties) {
    return { propertyNames, properties };
  }

  for (const key in componentProperties) {
    if (!Object.prototype.hasOwnProperty.call(componentProperties, key)) continue;

    const prop = componentProperties[key];
    if (!prop || typeof prop !== 'object') continue;

    // Извлекаем простое имя (без ID после #)
    const simpleName = key.split('#')[0];

    // Определяем тип свойства
    let propType: PropertyMetadata['type'] = 'TEXT';
    const propAsRecord = prop as Record<string, unknown>;
    if ('type' in prop) {
      const rawType = propAsRecord.type;
      if (rawType === 'VARIANT') propType = 'VARIANT';
      else if (rawType === 'BOOLEAN') propType = 'BOOLEAN';
      else if (rawType === 'INSTANCE_SWAP') propType = 'INSTANCE_SWAP';
      else if (rawType === 'EXPOSED_INSTANCE') propType = 'EXPOSED_INSTANCE';
    } else if ('value' in prop && typeof propAsRecord.value === 'boolean') {
      propType = 'BOOLEAN';
    } else if ('options' in prop) {
      propType = 'VARIANT';
    }

    // Получаем options для VARIANT свойств
    let options: readonly string[] | undefined;
    if ('options' in prop && Array.isArray(prop.options)) {
      options = prop.options as readonly string[];
    }

    // Получаем значение по умолчанию
    let defaultValue: string | boolean | undefined;
    if ('value' in prop) {
      const val = prop.value;
      if (typeof val === 'string' || typeof val === 'boolean') {
        defaultValue = val;
      }
    }

    // Сохраняем метаданные свойства
    properties[key] = {
      key,
      simpleName,
      type: propType,
      options,
      defaultValue,
    };

    // Регистрируем все варианты нормализации имени для быстрого lookup
    const normalized = normalizePropertyName(simpleName);

    // Приоритет: первый зарегистрированный ключ побеждает
    // (обычно свойства уникальны, но на всякий случай)
    if (!(normalized in propertyNames)) {
      propertyNames[normalized] = key;
    }
    if (!(simpleName.toLowerCase() in propertyNames)) {
      propertyNames[simpleName.toLowerCase()] = key;
    }
    if (!(simpleName in propertyNames)) {
      propertyNames[simpleName] = key;
    }
    // Также регистрируем полный ключ (для случаев, когда ищут по полному имени)
    if (!(key in propertyNames)) {
      propertyNames[key] = key;
    }
  }

  return { propertyNames, properties };
}

// ============================================================================
// API кэша
// ============================================================================

/**
 * Получает или строит кэш свойств для инстанса
 * СИНХРОННАЯ версия — не использует getMainComponentAsync()
 * Кэш строится из instance.componentProperties (всегда доступно синхронно)
 * @param instance Инстанс компонента
 * @returns Информация о свойствах компонента или null если нет свойств
 */
export function getOrBuildPropertyCache(instance: InstanceNode): ComponentPropertyInfo | null {
  // Stale-ref guard: after a variant swap on the parent, a previously cached sublayer
  // instance can still look like a valid ref but throw "The node does not exist" on
  // property access. Wrap the earliest access to surface this as a clean null.
  let instanceId: string;
  try {
    if ((instance as SceneNode).removed) return null;
    instanceId = instance.id;
  } catch {
    return null;
  }

  // Быстрый путь: проверяем кэш
  if (instanceId in propertyCache) {
    cacheHits++;
    return propertyCache[instanceId];
  }

  // Проверяем наличие свойств — componentProperties тоже может throw на stale-ref
  let componentProperties: InstanceNode['componentProperties'];
  try {
    componentProperties = instance.componentProperties;
  } catch {
    return null;
  }
  if (!componentProperties || Object.keys(componentProperties).length === 0) {
    return null;
  }

  // Строим кэш
  cacheMisses++;
  const info = buildPropertyInfo(instance);
  propertyCache[instanceId] = info;

  return info;
}

/**
 * Ищет ключ свойства по любому варианту имени
 * @param instance Инстанс компонента
 * @param requestedName Запрошенное имя свойства (может быть любой вариант)
 * @returns Полный ключ свойства или null если не найден
 */
export function findPropertyKey(instance: InstanceNode, requestedName: string): string | null {
  totalLookups++;

  const cache = getOrBuildPropertyCache(instance);
  if (!cache) {
    return null;
  }

  const { propertyNames } = cache;

  // Пробуем разные варианты имени (от точного к нормализованному)

  // 1. Точное совпадение (может быть полный ключ с #)
  if (requestedName in propertyNames) {
    return propertyNames[requestedName];
  }

  // 2. Lowercase
  const lowerName = requestedName.toLowerCase();
  if (lowerName in propertyNames) {
    return propertyNames[lowerName];
  }

  // 3. Полностью нормализованное (без пробелов, подчёркиваний, дефисов)
  const normalized = normalizePropertyName(requestedName);
  if (normalized in propertyNames) {
    return propertyNames[normalized];
  }

  // Не найдено
  return null;
}

/**
 * Получает метаданные свойства по ключу
 */
export function getPropertyMetadata(
  instance: InstanceNode,
  propertyKey: string,
): PropertyMetadata | null {
  const cache = getOrBuildPropertyCache(instance);
  if (!cache) return null;

  return cache.properties[propertyKey] || null;
}

/**
 * Проверяет, является ли значение валидным для VARIANT свойства
 * @returns Нормализованное значение из options или null если невалидно
 */
export function validateVariantValue(
  instance: InstanceNode,
  propertyKey: string,
  targetValue: string,
): string | null {
  const metadata = getPropertyMetadata(instance, propertyKey);
  if (
    !metadata ||
    metadata.type !== 'VARIANT' ||
    !metadata.options ||
    metadata.options.length === 0
  ) {
    return null;
  }

  const targetLower = targetValue.toLowerCase();

  // Точное совпадение
  for (const option of metadata.options) {
    if (option === targetValue) {
      return option;
    }
  }

  // Без учёта регистра
  for (const option of metadata.options) {
    if (option.toLowerCase() === targetLower) {
      return option;
    }
  }

  // Boolean значения (true/false как строки)
  if (targetLower === 'true' || targetLower === 'false') {
    for (const option of metadata.options) {
      const optLower = option.toLowerCase();
      if (
        optLower === targetLower ||
        (targetLower === 'true' && optLower === '1') ||
        (targetLower === 'false' && optLower === '0')
      ) {
        return option;
      }
    }
  }

  return null;
}

/**
 * Сбрасывает кэш (вызывать перед каждым batch)
 */
export function resetComponentCache(): void {
  propertyCache = {};
  cacheHits = 0;
  cacheMisses = 0;
  totalLookups = 0;
  Logger.debug('🧹 [PropCache] Кэш свойств компонентов очищен');
}

/**
 * Выводит статистику использования кэша (вызывать после batch)
 */
export function logComponentCacheStats(): void {
  const cachedInstances = Object.keys(propertyCache).length;

  if (cachedInstances === 0 && totalLookups === 0) {
    return; // Ничего не кэшировали и не искали
  }

  const hitRate = totalLookups > 0 ? ((cacheHits / totalLookups) * 100).toFixed(1) : '0';

  Logger.verbose(`📊 [PropCache] Статистика (SYNC):`);
  Logger.verbose(`   - Закэшировано инстансов: ${cachedInstances}`);
  Logger.verbose(`   - Всего lookups: ${totalLookups}`);
  Logger.verbose(`   - Cache hits: ${cacheHits} (${hitRate}%)`);
  Logger.verbose(`   - Cache misses: ${cacheMisses}`);
}

/**
 * Получает все свойства инстанса из кэша (для отладки)
 */
export function getCachedPropertyNames(instance: InstanceNode): string[] {
  const cache = getOrBuildPropertyCache(instance);
  if (!cache) return [];

  return Object.keys(cache.properties).map((key) => {
    const meta = cache.properties[key];
    return meta.simpleName;
  });
}
