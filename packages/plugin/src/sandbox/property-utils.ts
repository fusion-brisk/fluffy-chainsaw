import { Logger } from '../logger';
import { findPropertyKey } from '../utils/component-cache';
import {
  trackMissingProperty,
  trackSetPropertyError,
  incrementFieldsSet,
  incrementFieldsFailed,
} from './property-logging';
import {
  parseVariantSyntax,
  detectPropertyType,
  normalizeVariantValue,
} from './variant-parser';

// Re-export everything from sub-modules so existing imports don't break
export {
  resetFieldCounts,
  getFieldCounts,
  resetPropertyWarnings,
  logPropertyWarnings,
} from './property-logging';

export {
  parseVariantSyntax,
  detectPropertyType,
  normalizeVariantValue,
} from './variant-parser';

export type { PropertyCategory } from './variant-parser';

// ============================================================================
// Утилиты для значений свойств
// ============================================================================

/**
 * Конвертирует boolean в строку для Figma variant properties
 * Figma требует "True"/"False" с большой буквы
 */
export function boolToFigma(value: boolean): string {
  return value ? 'True' : 'False';
}

// ============================================================================
// Helper функции
// ============================================================================

/**
 * Устанавливает свойство с fallback на полный ключ.
 * Сначала пробует простое имя, при ошибке — полный ключ с ID.
 *
 * @param instance Инстанс компонента
 * @param simpleKey Простое имя свойства (например, "View")
 * @param fullKey Полный ключ с ID (например, "View#12345:0")
 * @param value Значение для установки
 * @returns true если установлено успешно, false при ошибке
 */
function setPropertyWithFallback(
  instance: InstanceNode,
  simpleKey: string,
  fullKey: string,
  value: string | boolean
): boolean {
  try {
    instance.setProperties({ [simpleKey]: value });
    return true;
  } catch {
    if (fullKey !== simpleKey) {
      try {
        instance.setProperties({ [fullKey]: value });
        return true;
      } catch {
        Logger.debug('[setProperty] Both keys failed: ' + simpleKey + ', ' + fullKey);
      }
    }
    return false;
  }
}

/**
 * Собирает все текущие свойства инстанса для batch-установки.
 */
function collectCurrentProperties(instance: InstanceNode): { [key: string]: string | boolean } {
  const result: { [key: string]: string | boolean } = {};
  const props = instance.componentProperties;

  for (const key in props) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) continue;

    const prop = props[key];
    if (prop && typeof prop === 'object' && 'value' in prop) {
      const simpleName = key.split('#')[0];
      const value = prop.value;

      if (typeof value === 'string' || typeof value === 'boolean') {
        result[simpleName] = value;
      } else if (typeof value === 'number') {
        result[simpleName] = String(value);
      }
    }
  }

  return result;
}

/**
 * Устанавливает VARIANT свойство без доступных options.
 * Пробует несколько стратегий: простой ключ, полный ключ, все свойства.
 */
function setVariantWithoutOptions(
  instance: InstanceNode,
  simpleKey: string,
  fullKey: string,
  value: string,
  _fieldName: string
): boolean {
  // Стратегия 1: только целевое свойство
  if (setPropertyWithFallback(instance, simpleKey, fullKey, value)) {
    const updated = instance.componentProperties[fullKey];
    const updatedValue = updated && typeof updated === 'object' && 'value' in updated ? updated.value : null;
    if (String(updatedValue) === value) {
      Logger.debug(`   ✅ Установлено "${simpleKey}" = "${value}"`);
      return true;
    }
  }

  // Стратегия 2: со всеми текущими свойствами
  const allProps = collectCurrentProperties(instance);
  allProps[simpleKey] = value;

  try {
    instance.setProperties(allProps);
    const updated = instance.componentProperties[fullKey];
    const updatedValue = updated && typeof updated === 'object' && 'value' in updated ? updated.value : null;
    if (String(updatedValue) === value) {
      Logger.debug(`   ✅ Установлено со всеми свойствами: "${simpleKey}" = "${value}"`);
      return true;
    }
  } catch {
    // Property batch set failed (removed node or restricted property) — skip silently
  }

  trackSetPropertyError(instance.name, simpleKey, value, instance);
  return false;
}

/**
 * Устанавливает VARIANT свойство с валидацией против options.
 */
function setVariantWithOptions(
  instance: InstanceNode,
  simpleKey: string,
  fullKey: string,
  value: string,
  options: readonly string[],
  _fieldName: string
): boolean {
  // Exposed property (пустые options)
  if (options.length === 0) {
    if (setPropertyWithFallback(instance, simpleKey, fullKey, value)) {
      Logger.debug(`   ✅ Exposed property "${simpleKey}" = "${value}"`);
      return true;
    }
    return false;
  }

  // Нормализуем значение
  const normalized = normalizeVariantValue(value, options);
  if (!normalized) {
    Logger.warn(`⚠️ Значение "${value}" не найдено в options: [${options.join(', ')}]`);
    return false;
  }

  // Устанавливаем
  if (setPropertyWithFallback(instance, simpleKey, fullKey, normalized)) {
    Logger.debug(`   ✅ Variant "${simpleKey}" = "${normalized}"`);
    return true;
  }

  Logger.error(`❌ Не удалось установить "${simpleKey}" = "${normalized}"`);
  return false;
}

// ============================================================================
// Оптимизированные функции установки свойств
// ============================================================================

/**
 * Проверяет существование свойства и устанавливает значение ТОЛЬКО если свойство существует.
 * Принимает список возможных имён свойства и пробует найти первое существующее.
 *
 * ⚡ РЕКОМЕНДУЕМЫЙ API — использует кэш для O(1) lookup.
 *
 * @param instance Инстанс компонента
 * @param propertyNames Массив возможных имён свойства (например, ['View', 'view', 'VIEW'])
 * @param value Значение для установки
 * @param fieldName Имя поля для логирования
 * @returns true если свойство найдено и установлено, false если свойство не существует
 *
 * @example
 * // Установка View с fallback вариантами
 * trySetProperty(instance, ['View', 'view', 'VIEW'], 'large', '#View');
 *
 * @example
 * // Установка boolean
 * trySetProperty(instance, ['Discount', 'discount'], true, '#Discount');
 */
export function trySetProperty(
  instance: InstanceNode,
  propertyNames: string[],
  value: string | boolean,
  fieldName: string
): boolean {
  // Проверяем существование свойства через кэш (O(1) для каждого имени)
  let foundKey: string | null = null;
  let foundName: string | null = null;

  for (const name of propertyNames) {
    foundKey = findPropertyKey(instance, name);
    if (foundKey) {
      foundName = name;
      break;
    }
  }

  if (!foundKey || !foundName) {
    // Свойство не существует — не тратим время на setProperties
    // Логируем только первое имя из списка для агрегации
    trackMissingProperty(instance.name, propertyNames[0], instance);
    incrementFieldsFailed();
    return false;
  }

  // Свойство найдено — устанавливаем значение
  const simpleKey = foundKey.split('#')[0];

  const success = setPropertyWithFallback(instance, simpleKey, foundKey, value);
  if (success) {
    Logger.debug(`   ✅ [trySetProperty] ${simpleKey}=${value} (${fieldName})`);
    incrementFieldsSet();
    return true;
  } else {
    trackSetPropertyError(instance.name, simpleKey, String(value), instance);
    incrementFieldsFailed();
    return false;
  }
}

/**
 * Устанавливает Variant Property ТОЛЬКО если свойство существует.
 * Формат: "PropertyName=value"
 *
 * ⚡ РЕКОМЕНДУЕМЫЙ API — использует кэш для O(1) lookup.
 *
 * @param instance Инстанс компонента
 * @param propertyVariants Массив форматов "PropertyName=value" (например, ['View=large', 'view=large'])
 * @param fieldName Имя поля для логирования
 * @returns true если хотя бы один вариант успешно установлен
 *
 * @example
 * // Установка View=large с fallback вариантами
 * trySetVariantProperty(instance, ['View=large', 'view=large'], '#View');
 */
export function trySetVariantProperty(
  instance: InstanceNode,
  propertyVariants: string[],
  fieldName: string
): boolean {
  for (const variant of propertyVariants) {
    const parsed = parseVariantSyntax(variant);
    if (!parsed) continue;

    const { propName, propValue } = parsed;

    // Проверяем существование свойства
    const foundKey = findPropertyKey(instance, propName);
    if (!foundKey) continue;

    // Свойство существует — пробуем установить
    const simpleKey = foundKey.split('#')[0];

    if (setPropertyWithFallback(instance, simpleKey, foundKey, propValue)) {
      Logger.debug(`   ✅ [trySetVariant] ${simpleKey}=${propValue} (${fieldName})`);
      return true;
    }
    // Продолжаем к следующему варианту
  }

  // Ни один вариант не сработал
  if (propertyVariants.length > 0) {
    const parsed = parseVariantSyntax(propertyVariants[0]);
    if (parsed) {
      trackMissingProperty(instance.name, parsed.propName, instance);
    }
  }
  return false;
}

/**
 * Рекурсивно устанавливает Variant Property во всех вложенных инстансах.
 * Оптимизированная версия с использованием кэша.
 *
 * ⚡ РЕКОМЕНДУЕМЫЙ API — использует кэш для O(1) lookup.
 *
 * @param node Корневой узел для обхода
 * @param propertyVariants Массив форматов "PropertyName=value"
 * @param fieldName Имя поля для логирования
 * @param allowedInstanceNames Опциональный фильтр по именам инстансов
 * @returns true если хотя бы одно свойство установлено
 */
export function trySetVariantPropertyRecursive(
  node: SceneNode,
  propertyVariants: string[],
  fieldName: string,
  allowedInstanceNames?: string[]
): boolean {
  if (node.removed) return false;

  let anySet = false;

  // Обрабатываем текущий узел, если это инстанс
  if (node.type === 'INSTANCE') {
    const instance = node as InstanceNode;

    // Проверяем фильтр по имени
    const shouldProcess = !allowedInstanceNames ||
                          allowedInstanceNames.length === 0 ||
                          allowedInstanceNames.includes(instance.name);

    if (shouldProcess) {
      const result = trySetVariantProperty(instance, propertyVariants, fieldName);
      anySet = anySet || result;
    }
  }

  // Рекурсивно обходим детей
  if ('children' in node && node.children) {
    for (const child of node.children) {
      if (!child.removed) {
        const childResult = trySetVariantPropertyRecursive(child, propertyVariants, fieldName, allowedInstanceNames);
        anySet = anySet || childResult;
      }
    }
  }

  return anySet;
}

/**
 * Обработка boolean-свойств компонентов (internal).
 * Парсит строковые значения из CSV/JSON и применяет через setProperties.
 */
function processBooleanProperty(instance: InstanceNode, propertyName: string, targetValue: string, fieldName: string, actualPropertyKey?: string): boolean {
  try {
    Logger.debug(`   🔧 [Boolean Property] Обработка boolean-свойства "${propertyName}", значение: "${targetValue}"`);

    // Парсим строковое значение в boolean
    // Поддерживаем: true/false, True/False, TRUE/FALSE, 1/0, "true"/"false", "1"/"0"
    const targetValueLower = targetValue.toLowerCase().trim();
    let booleanValue: boolean;

    if (targetValueLower === 'true' || targetValueLower === '1' || targetValueLower === '"true"' || targetValueLower === "'true'") {
      booleanValue = true;
    } else if (targetValueLower === 'false' || targetValueLower === '0' || targetValueLower === '"false"' || targetValueLower === "'false'") {
      booleanValue = false;
    } else {
      Logger.warn(`⚠️ Не удалось распарсить boolean-значение "${targetValue}" для свойства "${propertyName}"`);
      return false;
    }

    Logger.debug(`   📝 Распарсено: "${targetValue}" → ${booleanValue}`);

    // Определяем ключ для чтения и записи
    // Если передан actualPropertyKey (полное имя с ID), используем его для чтения
    // Для setProperties пробуем сначала простое имя, если не работает - используем полное
    const readKey = actualPropertyKey || propertyName;
    const property = instance.componentProperties[readKey];
    const currentValue = property && typeof property === 'object' && 'value' in property ? property.value : 'N/A';
    Logger.debug(`   📊 Текущее значение: "${currentValue}"`);

    // Устанавливаем значение через setProperties
    // Пробуем сначала простое имя, если не работает - используем полное имя с ID
    try {
      Logger.debug(`   🔧 Установка boolean-свойства "${propertyName}" = ${booleanValue} (было "${currentValue}")...`);

      // Пробуем сначала простое имя
      try {
        instance.setProperties({ [propertyName]: booleanValue });
        Logger.debug(`   ✅ Установлено через простое имя "${propertyName}"`);
      } catch (simpleNameError) {
        // Если не работает, пробуем полное имя с ID
        if (actualPropertyKey && actualPropertyKey !== propertyName) {
          Logger.debug(`   🔄 Попытка установки через полное имя "${actualPropertyKey}"...`);
          instance.setProperties({ [actualPropertyKey]: booleanValue });
          Logger.debug(`   ✅ Установлено через полное имя "${actualPropertyKey}"`);
        } else {
          throw simpleNameError;
        }
      }

      // Проверяем, что значение установилось (используем ключ для чтения)
      const updatedProperty = instance.componentProperties[readKey];
      const updatedValue = updatedProperty && typeof updatedProperty === 'object' && 'value' in updatedProperty ? updatedProperty.value : 'N/A';
      Logger.debug(`   ✅ Установлено boolean-свойство "${propertyName}" = ${booleanValue} (проверка: "${updatedValue}") для инстанса "${instance.name}" (поле "${fieldName}")`);
      return true;
    } catch (e) {
      Logger.error(`❌ Ошибка установки boolean-свойства "${propertyName}" для инстанса "${instance.name}":`, e);
      return false;
    }
  } catch (e) {
    Logger.error(`❌ Ошибка обработки boolean-свойства "${propertyName}":`, e);
    return false;
  }
}

// Диагностическая функция для логирования всех Component Properties (ES5-совместимо)
// Используем let/const - они будут транспилированы в var при сборке в ES5
export function debugComponentProperties(instance: InstanceNode): void {
  try {
    // eslint-disable-next-line prefer-const
    const props = instance.componentProperties || {};
    let key: string;

    for (key in props) {
      if (!Object.prototype.hasOwnProperty.call(props, key)) continue;

      const p = props[key];
      if (p && typeof p === 'object') {
        const propName = 'name' in p ? String(p.name) : 'N/A';
        const propType = 'type' in p ? String((p as Record<string, unknown>).type) : 'N/A';
        const propValue = 'value' in p ? String(p.value) : 'N/A';
        const variantOptions = 'variantOptions' in p ? (p as Record<string, unknown>).variantOptions : null;
        const variantOptionsStr = variantOptions ? JSON.stringify(variantOptions) : '[]';

        figma.ui.postMessage({
          type: 'log',
          message: '[ComponentProperty] key="' + key + '" ' +
            'name="' + propName + '" ' +
            'type="' + propType + '" ' +
            'value="' + propValue + '" ' +
            'variantOptions=' + variantOptionsStr
        });
      }
    }
  } catch (e) {
    Logger.error('❌ Ошибка в debugComponentProperties:', e);
  }
}

