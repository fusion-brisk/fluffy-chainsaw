import { Logger } from './logger';
import { findPropertyKey, getPropertyMetadata, validateVariantValue, logComponentCacheStats, getCachedPropertyNames } from './utils/component-cache';

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
    const sorted = Array.from(missingPropertyWarnings.entries())
      .sort((a, b) => b[1].count - a[1].count);
    
    for (const [key, stats] of sorted) {
      const [instanceType, propertyName] = key.split(':');
      Logger.verbose(`   "${propertyName}" в ${instanceType}: ${stats.count}×`);
    }
  }
  
  // Ошибки установки variant properties
  if (setPropertyErrors.size > 0) {
    Logger.verbose(`❌ Не удалось установить Variant Properties (свойство не найдено или значение невалидно):`);
    const sorted = Array.from(setPropertyErrors.entries())
      .sort((a, b) => b[1].count - a[1].count);
    
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
    // Используем info чтобы гарантированно видеть в логах
    Logger.info(`   📋 [${instanceType}] Доступные свойства: ${availableProps.join(', ')}`);
    Logger.info(`   💡 Искали: "${propertyName}" — не найдено`);
  }
}

/**
 * Регистрирует предупреждение о ненайденном свойстве (не выводит в лог)
 */
function trackMissingProperty(instanceName: string, propertyName: string, instance?: InstanceNode): void {
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
      instanceNames: new Set([instanceName])
    });
  }
}

/**
 * Регистрирует ошибку установки свойства (не выводит в лог)
 */
function trackSetPropertyError(instanceName: string, propertyName: string, value: string, instance?: InstanceNode): void {
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
      instanceNames: new Set([instanceName])
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
        // Обе попытки не удались
      }
    }
    return false;
  }
}

/**
 * Парсит синтаксис "PropertyName=value"
 * @returns { propName, propValue } или null если формат невалидный
 */
function parseVariantSyntax(value: string): { propName: string; propValue: string } | null {
  if (!value || typeof value !== 'string') {
    return null;
  }
  
  const trimmed = value.trim();
  const match = trimmed.match(/^([^=]+?)\s*=\s*(.+)$/);
  
  if (!match || match.length < 3) {
    return null;
  }
  
  const propName = match[1].trim();
  const propValue = match[2].trim();
  
  if (!propName || !propValue) {
    return null;
  }
  
  return { propName, propValue };
}

type PropertyCategory = 'VARIANT_WITH_OPTIONS' | 'VARIANT_NO_OPTIONS' | 'BOOLEAN' | 'UNKNOWN';

/**
 * Определяет категорию свойства компонента
 */
function detectPropertyType(property: unknown): PropertyCategory {
  if (!property || typeof property !== 'object') {
    return 'UNKNOWN';
  }
  
  const prop = property as Record<string, unknown>;
  const propType = prop.type;
  const hasOptions = 'options' in prop && Array.isArray(prop.options) && prop.options.length > 0;
  
  if (hasOptions) {
    return 'VARIANT_WITH_OPTIONS';
  }
  
  if (propType === 'VARIANT') {
    return 'VARIANT_NO_OPTIONS';
  }
  
  if ('value' in prop && typeof prop.value === 'boolean') {
    return 'BOOLEAN';
  }
  
  return 'UNKNOWN';
}

/**
 * Нормализует значение для VARIANT свойства.
 * Ищет совпадение в options с учётом регистра и boolean-значений.
 * 
 * @returns Нормализованное значение из options или null если не найдено
 */
function normalizeVariantValue(targetValue: string, options: readonly string[]): string | null {
  const targetLower = targetValue.toLowerCase();
  
  // 1. Точное совпадение
  for (const option of options) {
    if (option === targetValue) {
      return option;
    }
  }
  
  // 2. Без учёта регистра
  for (const option of options) {
    if (option.toLowerCase() === targetLower) {
      return option;
    }
  }
  
  // 3. Boolean-значения (true/false как строки)
  if (targetLower === 'true' || targetLower === 'false') {
    for (const option of options) {
      const optLower = option.toLowerCase();
      if (optLower === targetLower ||
          (targetLower === 'true' && optLower === '1') ||
          (targetLower === 'false' && optLower === '0')) {
        return option;
      }
    }
  }
  
  return null;
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
    // ignore
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
    return false;
  }
  
  // Свойство найдено — устанавливаем значение
  const simpleKey = foundKey.split('#')[0];
  
  const success = setPropertyWithFallback(instance, simpleKey, foundKey, value);
  if (success) {
    Logger.debug(`   ✅ [trySetProperty] ${simpleKey}=${value} (${fieldName})`);
    return true;
  } else {
    trackSetPropertyError(instance.name, simpleKey, String(value), instance);
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

/**
 * Обработка строковых свойств компонентов (internal, deprecated).
 * Перенаправляет на processVariantProperty для variant properties.
 */
function processStringProperty(instance: InstanceNode, propertyName: string, targetValue: string, fieldName: string, actualPropertyKey?: string): boolean {
  try {
    Logger.debug(`🔍 [String Property] Начало обработки для инстанса "${instance.name}", поле "${fieldName}", свойство "${propertyName}", значение: "${targetValue}"`);
    
    // Определяем ключ для чтения и записи
    const readKey = actualPropertyKey || propertyName;
    const property = instance.componentProperties[readKey];
    
    if (!property || typeof property !== 'object' || !('value' in property)) {
      Logger.warn(`⚠️ Свойство "${propertyName}" не найдено или не имеет значения`);
      return false;
    }
    
    const currentValue = property.value;
    const valueType = typeof currentValue;
    
    // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ структуры свойства
    Logger.debug(`   🔍 Детальная структура свойства "${propertyName}":`);
    Logger.debug(`      - Тип свойства: ${typeof property}`);
    Logger.debug(`      - Ключи свойства: [${Object.keys(property).join(', ')}]`);
    Logger.debug(`      - Текущее значение: "${currentValue}" (тип: ${valueType})`);
    Logger.debug(`      - Целевое значение: "${targetValue}"`);
    
    // Проверяем, является ли это variant property
    // Вариант 1: есть options (стандартный случай)
    // Вариант 2: type === 'VARIANT' (даже если options недоступны напрямую)
    const propertyType = 'type' in property ? (property as Record<string, unknown>).type : null;
    const isVariantProperty = 'options' in property || propertyType === 'VARIANT';
    
    if (isVariantProperty) {
      if ('options' in property) {
        const options = property.options as readonly string[];
        Logger.debug(`   📋 ✅ Свойство "${propertyName}" имеет варианты (options):`);
        Logger.debug(`      📝 Все доступные значения: [${options.map(o => `"${String(o)}"`).join(', ')}]`);
        Logger.debug(`      📊 Количество вариантов: ${options.length}`);
        Logger.debug(`      📊 Текущее значение: "${currentValue}" (тип: ${valueType})`);
        Logger.debug(`      🎯 Целевое значение: "${targetValue}"`);
        Logger.debug(`      ⚠️ Это variant property с options, но мы пытаемся установить как строковое свойство`);
        
        // Проверяем, есть ли целевое значение в options (с разными вариантами нормализации)
        const normalizedTarget = targetValue.toLowerCase().trim();
        Logger.debug(`      🔍 Поиск совпадения для "${targetValue}" (нормализовано: "${normalizedTarget}")...`);
        
        let foundOption: string | undefined = undefined;
        for (let i = 0; i < options.length; i++) {
          const opt = String(options[i]);
          const normalizedOpt = opt.toLowerCase().trim();
          Logger.debug(`         - Вариант ${i + 1}: "${opt}" (нормализовано: "${normalizedOpt}")`);
          if (normalizedOpt === normalizedTarget || opt === targetValue || normalizedOpt === targetValue.toLowerCase()) {
            foundOption = opt;
            Logger.debug(`         ✅ СОВПАДЕНИЕ найдено: "${opt}"`);
            break;
          }
        }
        
        if (foundOption) {
          Logger.debug(`   ✅ Найдено совпадение в options: "${foundOption}" (искали "${targetValue}")`);
          Logger.debug(`   💡 Рекомендуется использовать processVariantProperty вместо processStringProperty`);
        } else {
          Logger.warn(`   ⚠️ Значение "${targetValue}" не найдено в options. Доступные варианты: [${options.map(o => `"${String(o)}"`).join(', ')}]`);
          Logger.warn(`   💡 Проверьте точное соответствие значения (регистр, пробелы, дефисы)`);
        }
      } else if (propertyType === 'VARIANT') {
        Logger.debug(`   📋 ✅ Свойство "${propertyName}" является variant property (type: "VARIANT"), но options недоступны напрямую`);
        Logger.debug(`      📊 Текущее значение: "${currentValue}" (тип: ${valueType})`);
        Logger.debug(`      🎯 Целевое значение: "${targetValue}"`);
        Logger.debug(`      💡 Это variant property, рекомендуется использовать processVariantProperty вместо processStringProperty`);
        Logger.debug(`      🔄 Перенаправляем на processVariantProperty...`);
        
        // Перенаправляем на processVariantProperty с форматом PropertyName=value
        return processVariantProperty(instance, `${propertyName}=${targetValue}`, fieldName);
      }
    } else {
      Logger.debug(`   📊 Свойство "${propertyName}" НЕ является variant property`);
      Logger.debug(`   📊 Текущее значение: "${currentValue}" (тип: ${valueType})`);
      Logger.debug(`   🎯 Целевое значение: "${targetValue}"`);
      
      // Дополнительная проверка: может быть, options находятся в другом месте?
      Logger.debug(`   🔍 Проверка альтернативных мест для options...`);
      const propertyKeys = Object.keys(property);
      for (const key of propertyKeys) {
        const val = (property as Record<string, unknown>)[key];
        if (Array.isArray(val)) {
          Logger.debug(`      - Найден массив в ключе "${key}": [${val.map((v: unknown) => `"${String(v)}"`).join(', ')}]`);
        }
      }
    }
    
    // Проверяем, что это действительно строковое свойство
    if (valueType !== 'string') {
      Logger.warn(`⚠️ Свойство "${propertyName}" не является строковым (тип: ${valueType})`);
      return false;
    }
    
    // Для компонентов с вариантами нужно установить все свойства одновременно,
    // чтобы найти правильный вариант. Собираем все текущие свойства компонента.
    const allCurrentProperties: { [key: string]: string | boolean } = {};
    const allProps = instance.componentProperties;
    
    Logger.debug(`   🔍 Собираем все текущие свойства компонента для установки варианта...`);
    for (const propKey in allProps) {
      if (Object.prototype.hasOwnProperty.call(allProps, propKey)) {
        const prop = allProps[propKey];
        if (prop && typeof prop === 'object' && 'value' in prop) {
          const simplePropName = propKey.split('#')[0];
          const propValue = prop.value;
          // Преобразуем значение в string или boolean (setProperties не принимает number)
          const convertedValue = typeof propValue === 'number' ? String(propValue) : propValue;
          if (typeof convertedValue === 'string' || typeof convertedValue === 'boolean') {
            allCurrentProperties[simplePropName] = convertedValue;
            Logger.debug(`      - "${simplePropName}" = "${convertedValue}"`);
          }
        }
      }
    }
    
    // Устанавливаем новое значение для целевого свойства
    allCurrentProperties[propertyName] = targetValue;
    Logger.debug(`   🔧 Установка всех свойств компонента (включая "${propertyName}" = "${targetValue}")...`);
    
    // Устанавливаем все свойства одновременно через setProperties
    try {
      instance.setProperties(allCurrentProperties);
      Logger.debug(`   ✅ Установлено через setProperties со всеми свойствами`);
      
      // Проверяем, что значение установилось (используем ключ для чтения)
      const updatedProperty = instance.componentProperties[readKey];
      const updatedValue = updatedProperty && typeof updatedProperty === 'object' && 'value' in updatedProperty ? updatedProperty.value : 'N/A';
      Logger.debug(`   ✅ Установлено строковое свойство "${propertyName}" = "${targetValue}" (проверка: "${updatedValue}") для инстанса "${instance.name}" (поле "${fieldName}")`);
      return true;
    } catch (e) {
      Logger.error(`❌ Ошибка установки строкового свойства "${propertyName}" для инстанса "${instance.name}":`, e);
      // Если не получилось со всеми свойствами, пробуем только целевое свойство
      Logger.debug(`   🔄 Попытка установки только свойства "${propertyName}"...`);
      try {
        instance.setProperties({ [propertyName]: targetValue });
        Logger.debug(`   ✅ Установлено только свойство "${propertyName}"`);
        return true;
      } catch (e2) {
        Logger.error(`❌ Ошибка установки только свойства "${propertyName}":`, e2);
        return false;
      }
    }
  } catch (e) {
    Logger.error(`❌ Ошибка обработки строкового свойства "${propertyName}":`, e);
    return false;
  }
}

/**
 * @deprecated Используйте {@link trySetVariantProperty} для лучшей производительности.
 * Эта функция оставлена для обратной совместимости.
 * 
 * Обработка Variant Properties через синтаксис PropertyName=value (без маркера @).
 * Возвращает true, если значение было обработано как Variant Property.
 * 
 * @param instance Инстанс компонента
 * @param value Значение в формате "PropertyName=value"
 * @param fieldName Имя поля для логирования
 */
export function processVariantProperty(instance: InstanceNode, value: string, fieldName: string): boolean {
  try {
    Logger.debug(`🔍 [Variant Property] "${instance.name}", поле "${fieldName}", значение: "${value}"`);
    
    // 1. Парсим синтаксис
    const parsed = parseVariantSyntax(value);
    if (!parsed) {
      Logger.debug(`   ⏭️ Пропуск: не соответствует формату PropertyName=value`);
      return false;
    }
    
    const { propName, propValue } = parsed;
    Logger.debug(`   📝 Распарсено: propName="${propName}", propValue="${propValue}"`);
    
    // 2. Ищем свойство в кэше
    if (!instance.componentProperties) {
      Logger.warn(`⚠️ У инстанса "${instance.name}" нет componentProperties`);
      return false;
    }
    
    const foundKey = findPropertyKey(instance, propName);
    if (!foundKey) {
      trackMissingProperty(instance.name, propName, instance);
      return false;
    }
    
    const property = instance.componentProperties[foundKey];
    const simpleKey = foundKey.split('#')[0];
    
    // 3. Определяем тип свойства
    const category = detectPropertyType(property);
    Logger.debug(`   📋 Категория свойства: ${category}`);
    
    switch (category) {
      case 'BOOLEAN':
        return processBooleanProperty(instance, propName, propValue, fieldName, foundKey);
        
      case 'VARIANT_NO_OPTIONS':
        return setVariantWithoutOptions(instance, simpleKey, foundKey, propValue, fieldName);
        
      case 'VARIANT_WITH_OPTIONS': {
        const propWithOptions = property as unknown as { options: readonly string[] };
        return setVariantWithOptions(instance, simpleKey, foundKey, propValue, propWithOptions.options, fieldName);
      }
        
      default:
        Logger.warn(`⚠️ Property "${propName}" имеет неизвестный тип`);
        return false;
    }
  } catch (e) {
    Logger.error(`❌ Ошибка обработки Variant Property для "${fieldName}":`, e);
    return false;
  }
}

// Рекурсивная функция для обработки Variant Properties во вложенных инстансах
// Возвращает true, если хотя бы один Variant Property был обработан
// Опционально можно ограничить обработку только инстансами с определенными именами
export function processVariantPropertyRecursive(node: SceneNode, value: string, fieldName: string, allowedInstanceNames?: string[]): boolean {
  try {
    if (node.removed) return false;
    
    let processed = false;
    
    // Если это инстанс, обрабатываем Variant Property
    if (node.type === 'INSTANCE') {
      const instance = node as InstanceNode;
      
      // Если указаны разрешенные имена, проверяем, что инстанс в списке
      if (allowedInstanceNames && allowedInstanceNames.length > 0) {
        if (!allowedInstanceNames.includes(instance.name)) {
          // Пропускаем инстанс, но продолжаем рекурсивный обход
        } else {
          // Инстанс в списке разрешенных - обрабатываем
          processed = processVariantProperty(instance, value, fieldName);
        }
      } else {
        // Ограничений нет - обрабатываем все инстансы
        processed = processVariantProperty(instance, value, fieldName);
      }
    }
    
    // Рекурсивно обрабатываем дочерние элементы
    if ('children' in node && node.children) {
      for (const child of node.children) {
        if (!child.removed) {
          const childProcessed = processVariantPropertyRecursive(child, value, fieldName, allowedInstanceNames);
          processed = processed || childProcessed;
        }
      }
    }
    
    return processed;
  } catch (e) {
    Logger.error(`   ❌ [Recursive] Ошибка при рекурсивном обходе:`, e);
    // Игнорируем ошибки при рекурсивном обходе
    return false;
  }
}

