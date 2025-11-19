console.log('🚀 Плагин Contentify загружен');

// Настройка логирования
// false для продакшена (ускоряет работу), true для отладки
const DEBUG_MODE = false;

const Logger = {
  debug: (message: string, ...args: any[]) => {
    if (DEBUG_MODE) console.log(message, ...args);
  },
  info: (message: string, ...args: any[]) => {
    console.log(message, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(message, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(message, ...args);
  }
};

try {
  figma.showUI(__html__, { width: 320, height: 600 });
} catch (error) {
  Logger.error('❌ Ошибка при показе UI:', error);
  figma.notify('❌ Ошибка загрузки UI');
}

// Вспомогательные функции для оптимизации
// Удалено: isNodeAccessible - не используется

// isNodeVisible удалена - используется версия внутри обработчика сообщений

const safeGetLayerName = (layer: SceneNode): string | null => {
  try {
    if (layer.removed) return null;
    return layer.name;
  } catch {
    return null;
  }
};

const safeGetLayerType = (layer: SceneNode): string | null => {
  try {
    if (layer.removed) return null;
    return layer.type;
  } catch {
    return null;
  }
};

// Обработка boolean-свойств
// Парсит строковые значения из CSV/JSON и применяет через setProperties
// actualPropertyKey - полное имя свойства с ID (например, "Brand#22092:0"), если передан, используется для setProperties
// propertyName - простое имя свойства (например, "Brand"), используется для логирования
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
function debugComponentProperties(instance: InstanceNode): void {
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

// Обработка строковых свойств компонентов (не boolean, не variant property с options)
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

// Обработка Variant Properties через синтаксис PropertyName=value (без маркера @)
// Возвращает true, если значение было обработано как Variant Property (и не нужно применять как текст)
function processVariantProperty(instance: InstanceNode, value: string, fieldName: string): boolean {
  try {
    Logger.debug(`🔍 [Variant Property] Начало обработки для инстанса "${instance.name}", поле "${fieldName}", значение: "${value}"`);
    
    // Проверяем формат PropertyName=value (без маркера @)
    if (!value || typeof value !== 'string') {
      Logger.debug(`   ⏭️ Пропуск: значение не является строкой`);
      return false; // Не Variant Property, продолжаем обычную обработку
    }
    
    const trimmedValue = value.trim();
    
    // Парсим PropertyName=value (формат: имя свойства (может содержать пробелы), знак =, значение)
    // Используем нежадный квантификатор [^=]+? чтобы захватить имя свойства до первого =
    const match = trimmedValue.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!match || match.length < 3) {
      Logger.debug(`   ⏭️ Пропуск: не соответствует формату PropertyName=value`);
      return false; // Не соответствует формату Variant Property
    }
    
    const propertyName = match[1].trim();
    const targetValue = match[2].trim();
    
    Logger.debug(`   📝 Распарсено: propertyName="${propertyName}", targetValue="${targetValue}"`);
    
    if (!propertyName || !targetValue) {
      Logger.warn(`⚠️ Пустое имя или значение Variant Property для "${fieldName}": "${trimmedValue}"`);
      return false;
    }
    
    // Получаем componentProperties
    if (!instance.componentProperties) {
      Logger.warn(`⚠️ У инстанса "${instance.name}" нет componentProperties`);
      return false;
    }
    
    // ЛОГИРОВАНИЕ: Выводим все найденные свойства ДО проверки (для отладки)
    Logger.debug(`   📋 Все свойства инстанса "${instance.name}":`);
    const allProperties = instance.componentProperties;
    
    for (const propKey in allProperties) {
      if (Object.prototype.hasOwnProperty.call(allProperties, propKey)) {
        const prop = allProperties[propKey];
        
        if (prop && typeof prop === 'object') {
          if ('options' in prop) {
            // Это Variant Property с опциями
            const propOptions = prop.options as readonly string[];
            const currentValue = 'value' in prop ? prop.value : 'N/A';
            const defaultValue = 'defaultValue' in prop ? prop.defaultValue : 'N/A';
            Logger.debug(`      - "${propKey}" (variant): текущее="${currentValue}", по умолчанию="${defaultValue}", опции=[${propOptions.map(o => String(o)).join(', ')}]`);
          } else if ('value' in prop) {
            // Это может быть boolean-свойство или другое свойство без options
            const currentValue = prop.value;
            const valueType = typeof currentValue;
            Logger.debug(`      - "${propKey}" (${valueType}): текущее="${currentValue}"`);
          } else {
            Logger.debug(`      - "${propKey}": (другое свойство)`);
          }
        } else {
          Logger.debug(`      - "${propKey}": (другое свойство)`);
        }
      }
    }
    
    // Проверяем наличие параметра (сначала точное совпадение, затем частичное)
    let foundPropertyKey: string | null = null;
    let property: InstanceNode['componentProperties'][string] | null = null;
    
    // Нормализуем propertyName для поиска (убираем пробелы и приводим к нижнему регистру)
    const normalizedPropertyName = propertyName.replace(/\s+/g, '').toLowerCase();
    
    // 1. Пробуем точное совпадение
    if (propertyName in instance.componentProperties) {
      foundPropertyKey = propertyName;
      property = instance.componentProperties[propertyName];
      Logger.debug(`   ✅ Найдено точное совпадение: "${foundPropertyKey}"`);
    } else {
      // 2. Ищем по частичному совпадению (свойство начинается с propertyName)
      for (const propKey in instance.componentProperties) {
        if (Object.prototype.hasOwnProperty.call(instance.componentProperties, propKey)) {
          // Проверяем, начинается ли ключ с propertyName (например, "Brand#22092:0" начинается с "Brand")
          if (propKey.startsWith(propertyName)) {
            foundPropertyKey = propKey;
            property = instance.componentProperties[propKey];
            Logger.debug(`   ✅ Найдено частичное совпадение: "${propKey}" (искали "${propertyName}")`);
            break;
          }
        }
      }
      
      // 3. Если не нашли, пробуем поиск по нормализованному имени (без пробелов, без учета регистра)
      // Это нужно для случаев, когда propertyName = "Old Price", а propKey = "Old Price#14715:9"
      if (!foundPropertyKey) {
        for (const propKey in instance.componentProperties) {
          if (Object.prototype.hasOwnProperty.call(instance.componentProperties, propKey)) {
            // Нормализуем ключ свойства (убираем ID после # и пробелы, приводим к нижнему регистру)
            const propKeyWithoutId = propKey.split('#')[0]; // Убираем часть после #
            const normalizedPropKey = propKeyWithoutId.replace(/\s+/g, '').toLowerCase();
            
            // Проверяем совпадение нормализованных имен
            if (normalizedPropKey === normalizedPropertyName || normalizedPropKey.startsWith(normalizedPropertyName)) {
              foundPropertyKey = propKey;
              property = instance.componentProperties[propKey];
              Logger.debug(`   ✅ Найдено совпадение по нормализованному имени: "${propKey}" (искали "${propertyName}", нормализовано: "${normalizedPropertyName}")`);
              break;
            }
          }
        }
      }
    }
    
    if (!foundPropertyKey || !property) {
      Logger.warn(`⚠️ У инстанса "${instance.name}" нет свойства "${propertyName}" (ищем среди свойств выше)`);
      return false;
    }
    
    // Для setProperties используем простое имя (без ID), так как API принимает простое имя
    const propertyKeyForSetProperties = propertyName;
    
    // Проверяем тип свойства
    if (!property || typeof property !== 'object') {
      Logger.warn(`⚠️ Property "${propertyName}" у инстанса "${instance.name}" имеет неожиданный тип`);
      return false;
    }
    
    // Проверяем тип свойства
    const propertyType = 'type' in property ? (property as Record<string, unknown>).type : null;
    const isVariantProperty = 'options' in property || propertyType === 'VARIANT';
    
    // Сначала проверяем, является ли это Variant Property (есть options или type === 'VARIANT')
    // Это приоритетнее, чем boolean, так как variant properties могут иметь и value, и options
    if (isVariantProperty) {
      // Это Variant Property - обрабатываем ниже (продолжаем выполнение)
    } else if ('value' in property) {
      // Если нет options и type !== 'VARIANT', но есть value - проверяем, является ли это boolean-свойством
      const currentValue = property.value;
      const isBoolean = typeof currentValue === 'boolean';
      
      if (isBoolean) {
        Logger.debug(`   🔍 Свойство "${propertyName}" является boolean-свойством (текущее значение: ${currentValue})`);
        return processBooleanProperty(instance, propertyName, targetValue, fieldName, foundPropertyKey);
      } else {
        Logger.warn(`⚠️ Property "${propertyName}" у инстанса "${instance.name}" не является boolean-свойством (тип значения: ${typeof currentValue}) и не является Variant Property (нет options и type !== 'VARIANT')`);
        return false;
      }
    } else {
      Logger.warn(`⚠️ Property "${propertyName}" у инстанса "${instance.name}" не является Variant Property (нет options и type !== 'VARIANT') и не является boolean-свойством (нет value)`);
      return false;
    }
    
    // Если мы дошли сюда, значит это Variant Property (есть options или type === 'VARIANT')
    
    // Получаем текущее значение для логирования
    const currentValue = 'value' in property ? property.value : 'N/A';
    
    // Если есть options, используем их для валидации
    let options: readonly string[] | null = null;
    if ('options' in property) {
      options = property.options as readonly string[];
    if (!options || options.length === 0) {
      Logger.warn(`⚠️ У Variant Property "${propertyName}" нет доступных опций`);
      return false;
    }
    } else if (propertyType === 'VARIANT') {
      // Если type === 'VARIANT' но options недоступны, пробуем разные стратегии установки
      Logger.debug(`   ⚠️ Variant Property "${propertyName}" имеет type="VARIANT", но options недоступны.`);
      Logger.debug(`   💡 Пробуем установить свойство, позволяя Figma выбрать совместимые значения для других свойств...`);
      
      // Стратегия 1: Пробуем установить только целевое свойство
      // Figma может автоматически подобрать совместимые значения для других свойств
      Logger.debug(`   🔧 Попытка 1: Установка только "${propertyKeyForSetProperties}" = "${targetValue}"...`);
      try {
        instance.setProperties({ [propertyKeyForSetProperties]: targetValue });
        
        // Проверяем, что значение установилось
        const updatedProperty = instance.componentProperties[foundPropertyKey];
        const updatedValue = updatedProperty && typeof updatedProperty === 'object' && 'value' in updatedProperty ? updatedProperty.value : 'N/A';
        if (String(updatedValue) === String(targetValue)) {
          Logger.debug(`   ✅ Успешно установлено только "${propertyKeyForSetProperties}" = "${targetValue}" (проверка: "${updatedValue}")`);
          return true;
        } else {
          Logger.debug(`   ⚠️ Значение установилось, но не совпадает: ожидали "${targetValue}", получили "${updatedValue}"`);
        }
      } catch (e) {
        Logger.debug(`   ⚠️ Попытка 1 не удалась:`, e instanceof Error ? e.message : String(e));
      }
      
      // Стратегия 2: Устанавливаем со всеми текущими свойствами
      Logger.debug(`   🔧 Попытка 2: Установка со всеми текущими свойствами...`);
      const allCurrentProperties: { [key: string]: string | boolean } = {};
      const allProps = instance.componentProperties;
      
      for (const propKey in allProps) {
        if (Object.prototype.hasOwnProperty.call(allProps, propKey)) {
          const prop = allProps[propKey];
          if (prop && typeof prop === 'object' && 'value' in prop) {
            // Используем простое имя свойства (без ID после #) для setProperties
            const simplePropName = propKey.split('#')[0];
            const propValue = prop.value;
            // Преобразуем значение в string или boolean (setProperties не принимает number)
            const convertedValue = typeof propValue === 'number' ? String(propValue) : propValue;
            if (typeof convertedValue === 'string' || typeof convertedValue === 'boolean') {
              allCurrentProperties[simplePropName] = convertedValue;
            }
          }
        }
      }
      
      // Устанавливаем новое значение для целевого свойства
      allCurrentProperties[propertyKeyForSetProperties] = targetValue;
      Logger.debug(`      Устанавливаем свойства: ${Object.keys(allCurrentProperties).map(k => `${k}="${allCurrentProperties[k]}"`).join(', ')}`);
      
      try {
        instance.setProperties(allCurrentProperties);
        
        // Проверяем, что значение установилось
        const updatedProperty = instance.componentProperties[foundPropertyKey];
        const updatedValue = updatedProperty && typeof updatedProperty === 'object' && 'value' in updatedProperty ? updatedProperty.value : 'N/A';
        if (String(updatedValue) === String(targetValue)) {
          Logger.debug(`   ✅ Успешно установлено со всеми свойствами: "${propertyKeyForSetProperties}" = "${targetValue}" (проверка: "${updatedValue}")`);
          return true;
        } else {
          Logger.debug(`   ⚠️ Значение установилось, но не совпадает: ожидали "${targetValue}", получили "${updatedValue}"`);
        }
      } catch (e) {
        Logger.error(`❌ Попытка 2 также не удалась:`, e instanceof Error ? e.message : String(e));
      }
      
      // Если обе попытки не удались, возвращаем false
      Logger.error(`❌ Не удалось установить Variant Property "${propertyKeyForSetProperties}" = "${targetValue}" для инстанса "${instance.name}"`);
      Logger.error(`   💡 Возможно, комбинация свойств не существует в вариантах компонента.`);
      return false;
    }
    
    // Если options доступны, продолжаем стандартную обработку
    if (!options) {
      Logger.warn(`⚠️ Не удалось получить options для Variant Property "${propertyName}"`);
      return false;
    }
    Logger.debug(`   🎯 Найдено свойство "${propertyName}": текущее="${currentValue}", опции=[${options.map(o => String(o)).join(', ')}]`);
    
    // Нормализуем значение: ищем в options без учета регистра, но используем оригинальное значение из options
    // Также обрабатываем boolean значения (true/false) и их строковые представления
    let normalizedValue: string | null = null;
    const targetValueLower = targetValue.toLowerCase();
    
    Logger.debug(`   🔎 Поиск значения "${targetValue}" в опциях...`);
    
    // Сначала пробуем точное совпадение (с учетом регистра)
    for (const option of options) {
      if (option === targetValue) {
        normalizedValue = option;
        Logger.debug(`      ✅ Точное совпадение найдено: "${option}"`);
        break;
      }
    }
    
    // Если не нашли, пробуем без учета регистра
    if (normalizedValue === null) {
      Logger.debug(`      🔍 Поиск без учета регистра...`);
      for (const option of options) {
        if (option.toLowerCase() === targetValueLower) {
          normalizedValue = option; // Используем оригинальное значение из options
          Logger.debug(`      ✅ Совпадение без учета регистра: "${targetValue}" → "${option}"`);
          break;
        }
      }
    }
    
    // Если не нашли, пробуем обработать boolean значения (true/false как строки)
    if (normalizedValue === null) {
      // Проверяем, является ли targetValue boolean-строкой
      if (targetValueLower === 'true' || targetValueLower === 'false') {
        Logger.debug(`      🔍 Поиск boolean-значения "${targetValueLower}"...`);
        // Ищем в options значения, которые могут соответствовать boolean
        for (const option of options) {
          const optionLower = String(option).toLowerCase();
          // Проверяем соответствие: "true" может быть "True", "TRUE", "1" и т.д.
          if (optionLower === targetValueLower || 
              (targetValueLower === 'true' && optionLower === '1') ||
              (targetValueLower === 'false' && optionLower === '0')) {
            normalizedValue = String(option); // Используем оригинальное значение из options
            Logger.debug(`      ✅ Boolean-совпадение: "${targetValue}" → "${option}"`);
            break;
          }
        }
      }
    }
    
    if (normalizedValue === null) {
      Logger.warn(`⚠️ Значение "${targetValue}" не найдено в опциях Variant Property "${propertyName}" у инстанса "${instance.name}". Доступные опции: ${options.map(o => String(o)).join(', ')}`);
      return false;
    }
    
    // Устанавливаем значение (используем простое имя для setProperties)
    try {
      Logger.debug(`   🔧 Установка свойства "${propertyKeyForSetProperties}" = "${normalizedValue}" (было "${currentValue}")...`);
      instance.setProperties({ [propertyKeyForSetProperties]: normalizedValue });
      
      // Проверяем, что значение установилось (используем найденный ключ для чтения)
      const updatedProperty = instance.componentProperties[foundPropertyKey];
      const updatedValue = updatedProperty && typeof updatedProperty === 'object' && 'value' in updatedProperty ? updatedProperty.value : 'N/A';
      Logger.debug(`   ✅ Установлен Variant Property "${propertyKeyForSetProperties}" = "${normalizedValue}" (проверка: "${updatedValue}") для инстанса "${instance.name}" (поле "${fieldName}")`);
      return true; // Успешно обработано, не нужно применять как текст
    } catch (e) {
      Logger.error(`❌ Ошибка установки Variant Property "${propertyKeyForSetProperties}" для инстанса "${instance.name}":`, e);
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
function processVariantPropertyRecursive(node: SceneNode, value: string, fieldName: string, allowedInstanceNames?: string[]): boolean {
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
figma.ui.onmessage = async (msg) => {
  Logger.info('📨 Получено сообщение от UI:', msg.type);
  
  if (msg.type === 'test') {
    Logger.info('✅ Получено тестовое сообщение:', msg.message);
    figma.ui.postMessage({
      type: 'log',
      message: 'Плагин работает!'
    });
    return;
  }
  
  if (msg.type === 'get-theme') {
    Logger.info('🎨 Запрос темы от UI');
    figma.ui.postMessage({
      type: 'log',
      message: 'Тема применена автоматически'
    });
    return;
  }
  
  if (msg.type === 'close') {
    Logger.info('🚪 Закрытие плагина');
    figma.closePlugin();
    return;
  }
  
  if (msg.type === 'get-pages') {
    Logger.info('📄 Запрос списка страниц от UI');
    const pages = figma.root.children.map(page => page.name);
    figma.ui.postMessage({
      type: 'pages',
      pages: pages
    });
    return;
  }
  
  if (msg.type === 'check-selection') {
    const hasSelection = figma.currentPage.selection.length > 0;
    figma.ui.postMessage({
      type: 'selection-status',
      hasSelection: hasSelection
    });
    return;
  }
  
  if (msg.type === 'import-csv') {
    const startTime = Date.now();
    Logger.info('🔄 Начинаем оптимизированную обработку данных');
    
    const rows = msg.rows || [];
    const scope = msg.scope || 'page';
    const filter = msg.filter || '';

    Logger.info(`📊 Получено ${rows.length} строк данных`);
    Logger.info(`📍 Область: ${scope}`);
    
    const logTiming = (stage: string) => {
      const elapsed = Date.now() - startTime;
      Logger.info(`⏱️ [${elapsed}ms] ${stage}`);
    };

    // Определяем область поиска
    let searchNodes: readonly SceneNode[] = [];
    if (scope === 'selection') {
      searchNodes = figma.currentPage.selection;
      Logger.info(`🎯 Найдено ${searchNodes.length} выбранных элементов`);
      
      if (searchNodes.length === 0) {
        figma.notify('❌ Нет выбранных элементов');
        return;
      }
    } else {
      searchNodes = figma.currentPage.children;
      Logger.info(`🎯 Поиск по всей странице: ${searchNodes.length} элементов`);
    }
    
    // ОПТИМИЗИРОВАННАЯ ЛОГИКА: собираем слои с # и обрабатываем их
    Logger.info(`🔄 Начинаем оптимизированную обработку`);
    
    // Собираем все слои с # в порядке их появления в документе
    const allHashLayers: SceneNode[] = [];
    
    const collectAllHashLayers = (nodes: readonly SceneNode[]): void => {
      for (const node of nodes) {
        if (node.name.startsWith('#')) {
          allHashLayers.push(node);
        }
        
        // Рекурсивно ищем в дочерних элементах
        if ('children' in node && node.children) {
          collectAllHashLayers(node.children);
        }
      }
    };
    
    collectAllHashLayers(searchNodes);
    Logger.info(`📋 Найдено ${allHashLayers.length} слоев с #`);
    logTiming('Поиск слоев завершен');
    
    // Логируем найденные поля для отладки
    const fieldNames = allHashLayers.map(layer => layer.name);
    Logger.debug(`🔍 Найденные поля:`, fieldNames.slice(0, 20)); // первые 20
    
    if (allHashLayers.length === 0) {
      figma.notify('❌ Нет слоев с # для заполнения');
      return;
    }

            // ПРОСТОЙ АЛГОРИТМ: Группировка по конкретным именам контейнеров
            const snippetGroups = new Map<string, SceneNode[]>();
            
            // Конкретные имена контейнеров-сниппетов
            const snippetContainerNames = ['Snippet', 'ESnippet', 'EProductSnippet', 'EOfferItem', 'EShopItem'];
            
            // ОПТИМИЗАЦИЯ: Кэш для проверки selection (создаем Set для быстрого поиска)
            const searchNodesSet = scope === 'selection' ? new Set(searchNodes) : null;
            
            // Функция для поиска контейнера с конкретным именем
            const findNamedSnippetContainer = (layer: SceneNode): BaseNode | null => {
              let current: BaseNode | null = layer.parent;
              
              while (current) {
                // Проверяем точное совпадение имени
                if (snippetContainerNames.includes(current.name)) {
                  // Для selection: быстрая проверка через Set
                  if (scope === 'selection' && searchNodesSet) {
                    // Проверяем, что контейнер или его родители в выделении
                    let checkNode: BaseNode | null = current;
                    let found = false;
                    while (checkNode) {
                      if (searchNodesSet.has(checkNode as SceneNode)) {
                        found = true;
                        break;
                      }
                      checkNode = checkNode.parent;
                    }
                    if (!found) {
                    return null; // Контейнер вне выделения
                    }
                  }
                  return current;
                }
                current = current.parent;
              }
              
              return null; // Не нашли подходящий контейнер
            };
            
            // ОПТИМИЗАЦИЯ: Кэшируем результаты проверок для ускорения
            const containerCache = new Map<SceneNode, BaseNode | null>();
            
            // Группируем слои по их контейнерам-сниппетам
            for (const layer of allHashLayers) {
              try {
                // Быстрая проверка removed без полной проверки доступности
                if (layer.removed) continue;
                
                const layerName = safeGetLayerName(layer);
                if (!layerName) continue;
                
                // Используем кэш для поиска контейнера
                let snippetContainer = containerCache.get(layer);
                if (snippetContainer === undefined) {
                  snippetContainer = findNamedSnippetContainer(layer);
                  containerCache.set(layer, snippetContainer);
                }
                
                if (snippetContainer && !snippetContainer.removed) {
                  try {
                    const containerKey = snippetContainer.id;
                  
                  if (!snippetGroups.has(containerKey)) {
                    snippetGroups.set(containerKey, []);
                  }
                  snippetGroups.get(containerKey)!.push(layer);
                  } catch (propError) {
                    // Пропускаем проблемные контейнеры
                    continue;
                  }
                }
              } catch (groupError) {
                // Продолжаем обработку других слоев
                continue;
              }
            }
            
            // Логируем итоговые группы
            Logger.info(`📊 Создано ${snippetGroups.size} групп сниппетов:`);
    logTiming('Группировка сниппетов завершена');
            for (const [containerKey, layers] of snippetGroups) {
              try {
                // КРИТИЧЕСКОЕ: Проверяем, что первый слой не удален перед обращением к его свойствам
                const firstLayer = layers[0];
                let containerName = 'Unknown';
                if (firstLayer && !firstLayer.removed) {
                  try {
                    const parent = firstLayer.parent;
                    if (parent && !parent.removed) {
                      containerName = parent.name || 'Unknown';
                    }
                  } catch (parentError) {
                    Logger.warn(`⚠️ Ошибка получения имени контейнера для ${containerKey}:`, parentError);
                  }
                }
                Logger.debug(`📦 "${containerName}" (${containerKey}): ${layers.length} слоев`);
              } catch (logError) {
                Logger.error(`❌ Ошибка логирования группы ${containerKey}:`, logError);
              }
            }
            
            // Используем созданные группы
            const finalContainerMap = snippetGroups;
    
    // Теперь назначаем строки контейнерам и создаем layerData
    const normalizeFieldName = (name: string): string => name ? String(name).trim().toLowerCase() : '';
    interface LayerDataItem {
      layer: SceneNode;
      rowIndex: number;
      fieldName: string;
      fieldValue: string | undefined;
      isImage: boolean;
      isText: boolean;
      isShape: boolean;
      row: { [key: string]: string } | null; // Ссылка на данные строки для обновления
    }
    const layerData: LayerDataItem[] = [];
    let nextRowIndex = 0;
    
    Logger.info(`📊 Назначаем строки для ${finalContainerMap.size} контейнеров (всего строк: ${rows.length})`);
    
    for (const [containerKey, layers] of finalContainerMap) {
      try {
        if (!layers || layers.length === 0) {
          nextRowIndex++;
          continue;
        }
        
        // ОПТИМИЗАЦИЯ: Быстрая фильтрация только по removed (без полной проверки доступности)
        const validLayers = layers.filter(layer => !layer.removed);
        
        if (validLayers.length === 0) {
          nextRowIndex++;
          continue;
        }
        
        const rowIndex = nextRowIndex % rows.length;
        const row = rows[rowIndex];
      
      // Подготавливаем карту ключей строки для нечувствительного к регистру поиска
      const rowKeyMap: { [key: string]: string } = {};
      try {
        for (const key in row) {
          if (Object.prototype.hasOwnProperty.call(row, key)) {
            rowKeyMap[normalizeFieldName(key)] = row[key];
          }
        }
      } catch (e) {
        // ignore
      }

        // Все слои в этом контейнере получают данные из одной строки
        // Отслеживаем дубликаты полей в контейнере - обновляем только первый слой с таким именем
        const processedFieldNames = new Set<string>();
        
        for (const layer of validLayers) {
          try {
            // Быстрая проверка removed
            if (layer.removed) continue;
            
            const fieldName = safeGetLayerName(layer);
            if (!fieldName) continue;
            
            // Пропускаем дубликаты полей
            if (processedFieldNames.has(fieldName)) continue;
            processedFieldNames.add(fieldName);
            
            const normName = normalizeFieldName(fieldName);
            const direct = row[fieldName];
            const fallback = rowKeyMap[normName];
            const fieldValue = (direct !== undefined && direct !== null ? direct : fallback);
            
            // ДИАГНОСТИКА: Логируем FaviconImage на этапе создания layerData
            const isFaviconField = normalizeFieldName(fieldName).includes('favicon');
            if (isFaviconField) {
              Logger.debug(`🔍 [DIAGNOSTIC] Найден FaviconImage слой: fieldName="${fieldName}", fieldValue="${fieldValue !== undefined && fieldValue !== null ? String(fieldValue).substring(0, 100) : 'null/undefined'}..."`);
            }
            
            // Пропускаем пустые значения
            if (fieldValue === undefined || fieldValue === null || 
                (typeof fieldValue === 'string' && fieldValue.trim() === '')) {
              // ДИАГНОСТИКА: Логируем, если это favicon с пустым значением
              if (isFaviconField) {
                Logger.debug(`⚠️ [DIAGNOSTIC] FaviconImage слой "${fieldName}" пропущен из-за пустого fieldValue`);
              }
              continue;
            }
            
            const layerType = safeGetLayerType(layer);
            if (!layerType) {
              // ДИАГНОСТИКА: Логируем, если это favicon без типа слоя
              if (isFaviconField) {
                Logger.debug(`⚠️ [DIAGNOSTIC] FaviconImage слой "${fieldName}" пропущен из-за отсутствия layerType`);
              }
              continue;
            }
          
            // Определяем тип слоя
          let isTextLayer = layerType === 'TEXT';
          const isImageLayer = normalizeFieldName(fieldName).endsWith('image');
          const isShapeLayer = layerType === 'RECTANGLE' || layerType === 'ELLIPSE' || layerType === 'POLYGON';
          
          // ДИАГНОСТИКА: Логируем для favicon, определяется ли он как изображение
          if (isFaviconField) {
            Logger.debug(`🔍 [DIAGNOSTIC] FaviconImage слой "${fieldName}": layerType="${layerType}", isImageLayer=${isImageLayer}`);
          }
          
          if (layerType === 'INSTANCE') {
            const textFieldNames = ['#organicTitle', '#shoptitle', '#shopname', '#brand', '#organicprice', '#oldprice', '#organictext'];
            if (textFieldNames.includes(normalizeFieldName(fieldName))) {
              isTextLayer = true;
            }
          }
          
            layerData.push({
              layer,
              rowIndex,
              fieldName,
              fieldValue,
              isImage: isImageLayer,
              isText: isTextLayer,
              isShape: isShapeLayer,
              row: row // Сохраняем ссылку на строку для обновления данных
            });
          } catch (layerError) {
            // Продолжаем обработку других слоев
            continue;
          }
        }
        
        // Всегда двигаем индекс строки — одна группа = одна строка
        nextRowIndex++;
      } catch (containerError) {
        Logger.error(`❌ Ошибка обработки контейнера ${containerKey}:`, containerError);
        // Продолжаем обработку других контейнеров
        nextRowIndex++;
      }
    }
    
    Logger.info(`📊 Создано ${layerData.length} элементов layerData`);
    
    const textCount = layerData.filter(item => item.isText).length;
    const imageCount = layerData.filter(item => item.isImage).length;
    const shapeCount = layerData.filter(item => item.isShape).length;
    Logger.info(`📊 Типы слоев: ${textCount} текстовых, ${imageCount} изображений, ${shapeCount} фигур`);
    
    // Отладочная информация: какие типы слоев реально есть
    const layerTypes: { [key: string]: number } = {};
    layerData.forEach(item => {
      try {
        // КРИТИЧЕСКОЕ: Проверяем, что слой не удален перед обращением к его свойствам
        if (item.layer.removed) {
          return;
        }
        const type = item.layer.type;
        layerTypes[type] = (layerTypes[type] || 0) + 1;
      } catch (e) {
        // Игнорируем ошибки при получении типа слоя
      }
    });
    Logger.debug(`📊 Реальные типы слоев:`, layerTypes);
    
    // Проверяем, есть ли текстовые слои с данными
    const textLayersWithData = layerData.filter(item => item.isText && item.fieldValue !== undefined);
    Logger.debug(`📊 Текстовых слоев с данными: ${textLayersWithData.length}`);
    if (textCount > 0 && textLayersWithData.length === 0) {
      const sample = layerData.filter(item => item.isText).slice(0, 3);
      Logger.warn(`⚠️ Текстовые слои без данных! Примеры:`, sample.map(item => {
        try {
          // КРИТИЧЕСКОЕ: Проверяем, что слой не удален перед обращением к его свойствам
          if (item.layer.removed) {
            return { name: item.fieldName, type: 'REMOVED', hasValue: false, rowIndex: item.rowIndex };
          }
          return {
            name: item.fieldName,
            type: item.layer.type,
            hasValue: item.fieldValue !== undefined,
            rowIndex: item.rowIndex
          };
        } catch (e) {
          return { name: item.fieldName, type: 'ERROR', hasValue: false, rowIndex: item.rowIndex };
        }
      }));
    }

    // ОПТИМИЗАЦИЯ 2: Быстрая фильтрация слоев (убрана медленная проверка видимости родителей)
    const filterLower = filter ? filter.toLowerCase() : '';
    const filteredLayers = layerData.filter(item => {
      try {
        // Быстрые проверки без обращения к родителям
        if (item.layer.removed || item.layer.locked || !item.layer.visible) return false;
        if (filterLower && !item.fieldName.toLowerCase().includes(filterLower)) return false;
        return true;
      } catch (e) {
        // Игнорируем ошибки при фильтрации - исключаем проблемные слои
        return false;
      }
    });

    Logger.info(`📊 Обрабатываем ${filteredLayers.length} слоев из ${allHashLayers.length}`);

    // Обработка property Brand для инстансов сниппетов (fallback для обратной совместимости)
    // Если нет значения #Brand в обрабатываемых данных, устанавливаем property Brand в False
    // Используем новую универсальную функцию processVariantProperty
    const brandSnippetContainerNames = ['Snippet', 'ESnippet', 'EProductSnippet', 'EOfferItem', 'EShopItem'];
    
    // Группируем layerData по контейнерам сниппетов и проверяем наличие #Brand
    const containersMap = new Map<string, { 
      row: { [key: string]: string } | null; 
      container: BaseNode | null;
      hasBrandValue: boolean;
    }>();
    
    for (const item of layerData) {
      if (!item.row) continue;
      
      // Находим контейнер сниппета (Snippet, ESnippet и т.д.)
      let container: BaseNode | null = item.layer.parent;
      let containerKey: string | null = null;
      
      while (container) {
        if (brandSnippetContainerNames.includes(container.name)) {
          containerKey = container.id;
          break;
        }
        container = container.parent;
      }
      
      if (!containerKey) continue;
      
      // Проверяем, есть ли слой #Brand с непустым значением для этого контейнера
      const isBrandField = normalizeFieldName(item.fieldName) === 'brand';
      const brandValueStr = item.fieldValue ? String(item.fieldValue).trim() : '';
      // Игнорируем Variant Property синтаксис (формат PropertyName=value)
      const isVariantPropertySyntax = /^[^=\s]+=.+$/.test(brandValueStr);
      const hasBrandValue = isBrandField && 
                            item.fieldValue !== undefined && 
                            item.fieldValue !== null && 
                            brandValueStr !== '' &&
                            !isVariantPropertySyntax; // Игнорируем Variant Property синтаксис
      
      if (!containersMap.has(containerKey)) {
        containersMap.set(containerKey, { 
          row: item.row, 
          container: container,
          hasBrandValue: hasBrandValue
        });
      } else {
        // Если уже есть запись, обновляем hasBrandValue (если нашли #Brand с значением)
        const existing = containersMap.get(containerKey)!;
        if (hasBrandValue) {
          existing.hasBrandValue = true;
        }
      }
    }
    
    // Обрабатываем каждый контейнер: если нет значения #Brand, устанавливаем Brand=false через новую функцию
    Logger.debug(`🔍 [Brand Logic] Обработка ${containersMap.size} контейнеров сниппетов...`);
    for (const [containerKey, data] of containersMap) {
      if (!data.container) continue;
      
      const containerName = data.container.name || 'Unknown';
      Logger.debug(`   📦 Контейнер "${containerName}" (${containerKey}): hasBrandValue=${data.hasBrandValue}`);
      
      // Если нет значения #Brand в обрабатываемых данных, выключаем property Brand
      if (!data.hasBrandValue) {
        Logger.debug(`   🔧 Устанавливаем Brand=false для контейнера "${containerName}"`);
        // Используем новую универсальную функцию для установки Brand=false
        try {
          if (data.container.type === 'INSTANCE' && !data.container.removed) {
            const containerInstance = data.container as InstanceNode;
            // Проверяем, что это инстанс сниппета
            if (brandSnippetContainerNames.includes(containerInstance.name)) {
              Logger.debug(`      ✅ Контейнер "${containerInstance.name}" является инстансом, устанавливаем Brand=false`);
              // Обрабатываем сам инстанс и все вложенные инстансы сниппетов
              processVariantPropertyRecursive(containerInstance, 'Brand=false', '#Brand', brandSnippetContainerNames);
            } else {
              Logger.debug(`      ⏭️ Контейнер "${containerInstance.name}" не является инстансом сниппета`);
            }
          }
          
          // Также проверяем дочерние инстансы
          if ('children' in data.container) {
            Logger.debug(`      🔍 Поиск дочерних инстансов в "${containerName}"...`);
            for (const child of data.container.children) {
              if (child.type === 'INSTANCE' && !child.removed) {
                const instance = child as InstanceNode;
                if (brandSnippetContainerNames.includes(instance.name)) {
                  Logger.debug(`         ✅ Найден дочерний инстанс "${instance.name}", устанавливаем Brand=false`);
                  processVariantPropertyRecursive(instance, 'Brand=false', '#Brand', brandSnippetContainerNames);
                }
              }
            }
          }
        } catch (e) {
          Logger.error(`   ❌ Ошибка обработки контейнера "${containerName}":`, e);
        }
      } else {
        Logger.debug(`   ⏭️ Контейнер "${containerName}" имеет значение #Brand, пропускаем`);
      }
    }

    // Обработка EPriceGroup: установка Variant Properties "Discount" и "Old Price"
    // Если в строке данных есть поля #EPriceGroup_Discount или #EPriceGroup_OldPrice со значением 'true',
    // устанавливаем соответствующие свойства в true, иначе - в false
    Logger.debug(`🔍 [EPriceGroup Logic] Обработка EPriceGroup для сниппетов...`);
    
    // Функция для поиска инстанса EPriceGroup в контейнере
    const findEPriceGroupInstance = (node: BaseNode): InstanceNode | null => {
      if (node.type === 'INSTANCE' && node.name === 'EPriceGroup' && !node.removed) {
        return node as InstanceNode;
      }
      
      if ('children' in node && node.children) {
        for (const child of node.children) {
          const found = findEPriceGroupInstance(child);
          if (found) return found;
        }
      }
      
      return null;
    };
    
    // Группируем контейнеры по их ID и проверяем наличие полей EPriceGroup в соответствующих строках
    const ePriceGroupContainersMap = new Map<string, { 
      row: { [key: string]: string } | null; 
      container: BaseNode | null;
      hasDiscount: boolean;
      hasOldPrice: boolean;
    }>();
    
    // Проходим по всем контейнерам и их соответствующим строкам
    for (const [containerKey, layers] of finalContainerMap) {
      if (!layers || layers.length === 0) continue;
      
      // Находим контейнер сниппета (первый слой должен иметь родителя-контейнер)
      let container: BaseNode | null = null;
      for (const layer of layers) {
        if (layer.removed) continue;
        let current: BaseNode | null = layer.parent;
        while (current) {
          if (brandSnippetContainerNames.includes(current.name)) {
            container = current;
            break;
          }
          current = current.parent;
        }
        if (container) break;
      }
      
      if (!container) continue;
      
      // Определяем индекс строки для этого контейнера
      // Используем ту же логику, что и при создании layerData
      const containerIndex = Array.from(finalContainerMap.keys()).indexOf(containerKey);
      const rowIndex = containerIndex % rows.length;
      const row = rows[rowIndex];
      
      // Проверяем наличие полей #EPriceGroup_Discount и #EPriceGroup_OldPrice
      const hasDiscount = row && row['#EPriceGroup_Discount'] === 'true';
      const hasOldPrice = row && row['#EPriceGroup_OldPrice'] === 'true';
      
      // Сохраняем информацию о всех контейнерах (не только тех, где есть поля)
      ePriceGroupContainersMap.set(containerKey, { 
        row: row, 
        container: container,
        hasDiscount: hasDiscount || false,
        hasOldPrice: hasOldPrice || false
      });
    }
    
    // Обрабатываем каждый контейнер
    for (const [containerKey, data] of ePriceGroupContainersMap) {
      if (!data.container) continue;
      
      const containerName = data.container.name || 'Unknown';
      Logger.debug(`   📦 Контейнер "${containerName}" (${containerKey}): hasDiscount=${data.hasDiscount}, hasOldPrice=${data.hasOldPrice}`);
      
      // Ищем инстанс EPriceGroup в контейнере
      const ePriceGroupInstance = findEPriceGroupInstance(data.container);
      
      if (ePriceGroupInstance) {
        Logger.debug(`      ✅ Найден инстанс "EPriceGroup" в контейнере "${containerName}"`);
        
        // Устанавливаем Variant Properties: true если поля есть и равны 'true', иначе false
        if (data.hasDiscount) {
          Logger.debug(`      🔧 Устанавливаем Discount=true для инстанса "EPriceGroup"`);
          processVariantProperty(ePriceGroupInstance, 'Discount=true', '#EPriceGroup_Discount');
        } else {
          Logger.debug(`      🔧 Устанавливаем Discount=false для инстанса "EPriceGroup" (EPriceGroup-Pair не найден)`);
          processVariantProperty(ePriceGroupInstance, 'Discount=false', '#EPriceGroup_Discount');
        }
        
        if (data.hasOldPrice) {
          Logger.debug(`      🔧 Устанавливаем Old Price=true для инстанса "EPriceGroup"`);
          // Пробуем разные варианты названия свойства (с пробелом и без)
          if (!processVariantProperty(ePriceGroupInstance, 'Old Price=true', '#EPriceGroup_OldPrice')) {
            // Если не сработало, пробуем без пробела
            if (!processVariantProperty(ePriceGroupInstance, 'OldPrice=true', '#EPriceGroup_OldPrice')) {
              processVariantProperty(ePriceGroupInstance, 'Old_Price=true', '#EPriceGroup_OldPrice');
            }
          }
        } else {
          Logger.debug(`      🔧 Устанавливаем Old Price=false для инстанса "EPriceGroup" (EPriceGroup-Pair не найден)`);
          
          // Сначала выводим все свойства инстанса для отладки
          Logger.debug(`      📋 Все свойства инстанса "EPriceGroup" для отладки:`);
          const allProps = ePriceGroupInstance.componentProperties;
          for (const propKey in allProps) {
            if (Object.prototype.hasOwnProperty.call(allProps, propKey)) {
              const prop = allProps[propKey];
              if (prop && typeof prop === 'object') {
                if ('options' in prop) {
                  const propOptions = prop.options as readonly string[];
                  const currentValue = 'value' in prop ? prop.value : 'N/A';
                  Logger.debug(`         - "${propKey}" (variant): текущее="${currentValue}", опции=[${propOptions.map(o => String(o)).join(', ')}]`);
                } else if ('value' in prop) {
                  const currentValue = prop.value;
                  const valueType = typeof currentValue;
                  Logger.debug(`         - "${propKey}" (${valueType}): текущее="${currentValue}"`);
                }
              }
            }
          }
          
          // Пробуем разные варианты названия свойства (с пробелом и без)
          // Пробуем все варианты независимо от результата предыдущего
          let oldPriceSet = false;
          
          Logger.debug(`      🔄 Попытка 1: "Old Price=false"`);
          oldPriceSet = processVariantProperty(ePriceGroupInstance, 'Old Price=false', '#EPriceGroup_OldPrice') || oldPriceSet;
          
          Logger.debug(`      🔄 Попытка 2: "OldPrice=false"`);
          oldPriceSet = processVariantProperty(ePriceGroupInstance, 'OldPrice=false', '#EPriceGroup_OldPrice') || oldPriceSet;
          
          Logger.debug(`      🔄 Попытка 3: "Old_Price=false"`);
          oldPriceSet = processVariantProperty(ePriceGroupInstance, 'Old_Price=false', '#EPriceGroup_OldPrice') || oldPriceSet;
          
          // Также пробуем варианты с разными регистрами
          Logger.debug(`      🔄 Попытка 4: "old price=false"`);
          oldPriceSet = processVariantProperty(ePriceGroupInstance, 'old price=false', '#EPriceGroup_OldPrice') || oldPriceSet;
          
          Logger.debug(`      🔄 Попытка 5: "oldprice=false"`);
          oldPriceSet = processVariantProperty(ePriceGroupInstance, 'oldprice=false', '#EPriceGroup_OldPrice') || oldPriceSet;
          
          if (!oldPriceSet) {
            Logger.warn(`      ⚠️ Не удалось установить Old Price=false ни одним из вариантов названия`);
            Logger.warn(`      💡 Проверьте, что свойство "Old Price" существует в инстансе "EPriceGroup" и имеет boolean тип или вариант со значением "false"`);
          } else {
            Logger.debug(`      ✅ Успешно установлено Old Price=false`);
          }
        }
      } else {
        Logger.debug(`      ⚠️ Инстанс "EPriceGroup" не найден в контейнере "${containerName}"`);
      }
    }

    // ОПТИМИЗАЦИЯ 3: Разделяем обработку текста и изображений
    // Для текста: обрабатываем даже если fieldValue пустой (может быть пустая строка)
    const totalTextLayers = filteredLayers.filter(item => item.isText).length;
    const textLayersAll = filteredLayers.filter(item => item.isText && item.fieldValue !== undefined);
    Logger.info(`📝 Всего текстовых слоев: ${totalTextLayers}, с fieldValue: ${textLayersAll.length}`);
    
    // Отладочная информация: почему текстовые слои отфильтрованы
    if (totalTextLayers > 0 && textLayersAll.length === 0) {
      const sampleTextLayers = filteredLayers.filter(item => item.isText).slice(0, 3);
      Logger.warn(`⚠️ Все текстовые слои отфильтрованы! Примеры:`, sampleTextLayers.map(item => ({
        fieldName: item.fieldName,
        hasValue: item.fieldValue !== undefined,
        valueType: typeof item.fieldValue,
        valuePreview: item.fieldValue ? String(item.fieldValue).substring(0, 30) : 'null/undefined'
      })));
    }
    
    // ОПТИМИЗАЦИЯ: Убираем проверку совпадения текста - всегда обновляем для скорости
    // Чтение characters для каждого слоя замедляет обработку
    // Фильтруем только удаленные слои (locked/visible уже проверены выше)
    const textLayers = textLayersAll.filter(item => !item.layer.removed);
    Logger.info(`📝 Текстовых слоев для обработки: ${textLayers.length}`);
    
    // Собираем все изображения-слои
    const allImageLayers = filteredLayers.filter(item => item.isImage);
    Logger.info(`🖼️ Всего изображений-слоев: ${allImageLayers.length}`);
    
    // ДИАГНОСТИКА: Проверяем, какие поля изображений есть в allImageLayers
    if (allImageLayers.length > 0) {
      const imageFieldNames = allImageLayers.map(item => item.fieldName);
      const uniqueImageFields = Array.from(new Set(imageFieldNames));
      Logger.debug(`🔍 [DIAGNOSTIC] Поля изображений в allImageLayers:`, uniqueImageFields);
      
      // Проверяем конкретно FaviconImage
      const faviconLayersInAll = allImageLayers.filter(item => 
        normalizeFieldName(item.fieldName).includes('favicon')
      );
      if (faviconLayersInAll.length > 0) {
        Logger.debug(`🔍 [DIAGNOSTIC] Найдено ${faviconLayersInAll.length} слоев с favicon в allImageLayers:`);
        faviconLayersInAll.forEach((item, idx) => {
          Logger.debug(`   ${idx + 1}. fieldName="${item.fieldName}", fieldValue="${item.fieldValue ? String(item.fieldValue).substring(0, 100) : 'null/undefined'}..."`);
        });
      } else {
        Logger.debug(`⚠️ [DIAGNOSTIC] Нет слоев с favicon в allImageLayers!`);
      }
    }
    
    // Разделяем на валидные (с URL) и те, что нужно очистить
    const imageLayers: typeof filteredLayers = [];
    const imageClearLayers: typeof filteredLayers = [];
    
    for (const item of allImageLayers) {
      if (!item.fieldValue) {
        // ДИАГНОСТИКА: Логируем, если это favicon без значения
        if (normalizeFieldName(item.fieldName).includes('favicon')) {
          Logger.debug(`⚠️ [DIAGNOSTIC] Favicon слой "${item.fieldName}" не имеет fieldValue, пропускаем`);
        }
        imageClearLayers.push(item);
        continue;
      }
      const v = String(item.fieldValue).trim();
      // Валидные форматы: обычный URL, или SPRITE_LIST: для списка фавиконок
      if (v.startsWith('http') || v.startsWith('//') || v.startsWith('SPRITE_LIST:')) {
        imageLayers.push(item);
      } else {
        // ДИАГНОСТИКА: Логируем, если это favicon с невалидным форматом
        if (normalizeFieldName(item.fieldName).includes('favicon')) {
          Logger.debug(`⚠️ [DIAGNOSTIC] Favicon слой "${item.fieldName}" имеет невалидный формат: "${v.substring(0, 100)}..."`);
        }
        imageClearLayers.push(item);
      }
    }
    
    Logger.info(`🖼️ Валидных изображений с URL: ${imageLayers.length}, без URL (очистить): ${imageClearLayers.length}`);

    // Слои-изображения без ссылки — очищаем заливки, чтобы не оставались старые картинки
    if (imageClearLayers.length > 0) {
      for (const item of imageClearLayers) {
        try {
          if (item.layer.type === 'RECTANGLE' || item.layer.type === 'ELLIPSE' || item.layer.type === 'POLYGON') {
            (item.layer as RectangleNode | EllipseNode | PolygonNode).fills = [];
          }
        } catch (e) {
          // Игнорируем ошибки очистки
        }
      }
    }
    
    // Логируем, какие изображения найдены
    // ДИАГНОСТИКА: Выводим все имена полей изображений для отладки
    if (imageLayers.length > 0) {
      Logger.debug(`🔍 [DIAGNOSTIC] Все имена полей изображений:`);
      const fieldNames = imageLayers.map(item => item.fieldName);
      const uniqueFieldNames = Array.from(new Set(fieldNames));
      Logger.debug(`   Всего уникальных имен: ${uniqueFieldNames.length}`);
      uniqueFieldNames.forEach((name, idx) => {
        const count = fieldNames.filter(n => n === name).length;
        Logger.debug(`   ${idx + 1}. "${name}" (встречается ${count} раз)`);
      });
    }
    
    const faviconLayers = imageLayers.filter(item => item.fieldName.toLowerCase().includes('favicon'));
    Logger.info(`🖼️ Найдено ${imageLayers.length} изображений, из них ${faviconLayers.length} фавиконок`);
    if (faviconLayers.length > 0) {
      Logger.debug(`📋 Фавиконки:`, faviconLayers.map(item => `${item.fieldName}=${item.fieldValue?.substring(0, 50)}...`));
    } else if (imageLayers.length > 0) {
      // ДИАГНОСТИКА: Если фавиконки не найдены, проверяем возможные варианты имен
      const possibleFaviconFields = imageLayers.filter(item => {
        const lowerName = item.fieldName.toLowerCase();
        return lowerName.includes('icon') || lowerName.includes('shop') || lowerName.includes('logo');
      });
      if (possibleFaviconFields.length > 0) {
        Logger.debug(`⚠️ [DIAGNOSTIC] Фавиконки не найдены, но найдены похожие поля:`);
        possibleFaviconFields.forEach(item => {
          Logger.debug(`   - "${item.fieldName}" = "${item.fieldValue?.substring(0, 80)}..."`);
        });
      }
    }

    // ОПТИМИЗАЦИЯ 4: Предварительная загрузка всех шрифтов (с учетом MIXED и стилей с пробелами)
    if (textLayers.length > 0) {
      const fontsStartTime = Date.now();
      Logger.info(`📝 Загружаем шрифты для ${textLayers.length} текстовых слоев...`);

      // Собираем точные пары {family, style} из всех текстовых слоев, включая MIXED
      type FontPair = { family: string; style: string };
      const fontsToLoadMap: { [key: string]: FontPair } = {};

      for (const item of textLayers) {
        const textNode = item.layer as TextNode;
        try {
          const nodeCharacters = textNode.characters || '';
          const textLength = nodeCharacters.length;
          if (textLength === 0) {
            const fn = textNode.fontName as FontName | 'MIXED';
            if (fn && typeof fn === 'object' && fn.family && fn.style) {
              const key = `${fn.family}|||${fn.style}`;
              fontsToLoadMap[key] = { family: fn.family, style: fn.style };
            }
            continue;
          }

          // 1) Быстрый путь: используем getStyledTextSegments, если доступно
          const anyText = textNode as TextNode & { getStyledTextSegments?: (props: string[]) => Array<{ fontName: FontName | 'MIXED' }> };
          if (typeof anyText.getStyledTextSegments === 'function') {
            const segments = anyText.getStyledTextSegments(['fontName']);
            if (segments && segments.length) {
              for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                const fn = seg.fontName;
                if (fn && typeof fn === 'object' && fn.family && fn.style) {
                  const key = `${fn.family}|||${fn.style}`;
                  fontsToLoadMap[key] = { family: fn.family, style: fn.style };
                }
              }
              continue;
            }
          }

          // 2) Если сегменты недоступны: используем оригинальную MIXED-логику
          const fontName = textNode.fontName as FontName | 'MIXED';
          if (fontName && fontName !== 'MIXED' && typeof fontName === 'object') {
            if (fontName.family && fontName.style) {
              const key2 = `${fontName.family}|||${fontName.style}`;
              fontsToLoadMap[key2] = { family: fontName.family, style: fontName.style };
            }
          } else {
            let start = 0;
            while (start < textLength) {
              try {
                // Читаем шрифты без задержек
                const rangeFont = textNode.getRangeFontName(start, start + 1) as FontName | 'MIXED';
                let end = start + 1;
                while (end < textLength) {
                  const nextFont = textNode.getRangeFontName(end, end + 1) as FontName | 'MIXED';
                  if (!nextFont || nextFont === 'MIXED' || typeof nextFont !== 'object' || 
                      nextFont.family !== (typeof rangeFont === 'object' ? rangeFont.family : '') || 
                      nextFont.style !== (typeof rangeFont === 'object' ? rangeFont.style : '')) break;
                  end++;
                }
                if (rangeFont && rangeFont !== 'MIXED' && typeof rangeFont === 'object' && rangeFont.family && rangeFont.style) {
                  const key3 = `${rangeFont.family}|||${rangeFont.style}`;
                  fontsToLoadMap[key3] = { family: rangeFont.family, style: rangeFont.style };
                }
                start = end;
              } catch (e) {
                // Игнорируем ошибки чтения шрифтов для отдельных символов
                start++;
              }
            }
          }
        } catch (e) {
          // Игнорируем проблемы чтения шрифтов конкретного узла
        }
      }

      // ОПТИМИЗАЦИЯ: Прямое извлечение значений из Map без промежуточных преобразований
      const fontsToLoad = Array.from(Object.values(fontsToLoadMap));
      Logger.info(`🔤 Найдено ${fontsToLoad.length} уникальных шрифтов`);

      // Загружаем все шрифты ПАРАЛЛЕЛЬНО для ускорения
      let successfulFonts = 0;
      let failedFonts = 0;
      
      // Загружаем шрифты параллельно
      const fontPromises = fontsToLoad.map(async (fp) => {
        try {
          await figma.loadFontAsync({ family: fp.family, style: fp.style });
          successfulFonts += 1;
        } catch (error) {
          Logger.error(`❌ Ошибка загрузки шрифта ${fp.family} ${fp.style}:`, error);
          failedFonts += 1;
        }
      });

      await Promise.all(fontPromises);

      const fontsTime = Date.now() - fontsStartTime;
      Logger.info(`✅ Шрифтов загружено: ${successfulFonts}, ошибок: ${failedFonts} (${fontsTime}ms)`);
      logTiming('Загрузка шрифтов завершена');
      
      // Отправляем тайминг в UI
      figma.ui.postMessage({
        type: 'log',
        message: `⏱️ Загрузка шрифтов: ${(fontsTime / 1000).toFixed(2)}s`
      });

      // Теперь безопасно обрабатываем текстовые слои
      Logger.info(`📝 Обрабатываем ${textLayers.length} текстовых слоев...`);
      
      // ОПТИМИЗАЦИЯ: Упрощенная обработка текстовых слоев без избыточных проверок
      const textStartTime = Date.now();
      try {
        for (let i = 0; i < textLayers.length; i++) {
          const item = textLayers[i];
          try {
            // Быстрая проверка: пропускаем удаленные слои и пустые значения
            if (item.layer.removed || !item.fieldValue || item.fieldValue.trim() === '') {
            continue;
          }
          
            // Подготовка текста: ограничение длины и очистка
            let textValue = String(item.fieldValue);
          if (textValue.length > 10000) {
            textValue = textValue.substring(0, 10000);
          }
            // eslint-disable-next-line no-control-regex
          textValue = textValue.replace(/\0/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
          
            // Определяем тип слоя один раз
              const layerType = item.layer.type;
            
            // ОБРАБОТКА VARIANT PROPERTIES: проверяем, является ли значение инструкцией PropertyName=value
            // Проверяем формат PropertyName=value (содержит = и слева от = нет пробелов)
            let isVariantPropertyProcessed = false;
            const trimmedTextValue = textValue.trim();
            const isVariantPropertyFormat = /^[^=\s]+=.+$/.test(trimmedTextValue);
            
            if (isVariantPropertyFormat) {
              Logger.debug(`🔍 [Text Layer] Обнаружен формат Variant Property: "${trimmedTextValue}" для поля "${item.fieldName}"`);
              if (layerType === 'INSTANCE') {
                const instance = item.layer as InstanceNode;
                // Пробуем обработать как Variant Property
                isVariantPropertyProcessed = processVariantProperty(instance, trimmedTextValue, item.fieldName);
                
                // Также обрабатываем вложенные инстансы
                if ('children' in instance) {
                  const nestedProcessed = processVariantPropertyRecursive(instance, trimmedTextValue, item.fieldName);
                  isVariantPropertyProcessed = isVariantPropertyProcessed || nestedProcessed;
                }
              } else {
                // Для не-инстансов ищем инстансы в родителях и дочерних элементах
                // Проверяем родительские инстансы
                let parent: BaseNode | null = item.layer.parent;
                while (parent && !isVariantPropertyProcessed) {
                  if (parent.type === 'INSTANCE' && !parent.removed) {
                    isVariantPropertyProcessed = processVariantProperty(parent as InstanceNode, trimmedTextValue, item.fieldName);
                    if (isVariantPropertyProcessed) {
                      // Обрабатываем вложенные инстансы
                      const nestedProcessed = processVariantPropertyRecursive(parent as InstanceNode, trimmedTextValue, item.fieldName);
                      isVariantPropertyProcessed = isVariantPropertyProcessed || nestedProcessed;
                      break;
                    }
                  }
                  parent = parent.parent;
                }
                
                // Если не обработано в родителях, проверяем дочерние элементы
                if (!isVariantPropertyProcessed && 'children' in item.layer) {
                  isVariantPropertyProcessed = processVariantPropertyRecursive(item.layer, trimmedTextValue, item.fieldName);
                }
              }
            }
            
            // Если значение было обработано как Variant Property, не применяем его как текст
            if (isVariantPropertyProcessed) {
              Logger.debug(`   ✅ Значение "${trimmedTextValue}" обработано как Variant Property, пропускаем применение как текст`);
              continue;
            } else if (isVariantPropertyFormat) {
              Logger.debug(`   ⚠️ Значение "${trimmedTextValue}" имеет формат Variant Property, но не было обработано`);
            }
            
            if (layerType === 'TEXT') {
              // Прямой текстовый слой - устанавливаем напрямую
              try {
              (item.layer as TextNode).characters = textValue;
            } catch (setTextError) {
                Logger.error(`❌ Ошибка установки текста для "${item.fieldName}":`, setTextError);
              }
            } else if (layerType === 'INSTANCE') {
              // ОПТИМИЗАЦИЯ: Для INSTANCE используем прямой доступ к children в один проход
            const instance = item.layer as InstanceNode;
              try {
            let textLayer: TextNode | null = null;
                let firstTextLayer: TextNode | null = null;
                
                // Быстрый поиск: один проход по children
                if ('children' in instance && instance.children) {
                  for (const child of instance.children) {
                    if (child.type === 'TEXT' && !child.removed) {
                      // Сохраняем первый текстовый слой на случай, если точного совпадения не будет
                      if (!firstTextLayer) {
                        firstTextLayer = child as TextNode;
                      }
                      // Ищем слой с точным именем
                      if (child.name === item.fieldName) {
                        textLayer = child as TextNode;
                        break; // Нашли точное совпадение - выходим
                      }
                    }
                  }
                }
                
                // Используем точное совпадение или первый текстовый слой
                const targetLayer = textLayer || firstTextLayer;
                
                if (targetLayer) {
                  targetLayer.characters = textValue;
            } else {
                  Logger.warn(`⚠️ Не найден текстовый слой в INSTANCE "${instance.name}" для "${item.fieldName}"`);
                }
              } catch (instanceError) {
                Logger.error(`❌ Ошибка обработки INSTANCE "${item.fieldName}":`, instanceError);
              }
          }
        } catch (error) {
          Logger.error(`❌ Ошибка установки текста для "${item.fieldName}":`, error);
        }
        }
      } catch (outerError) {
        Logger.error(`❌ Критическая ошибка при обработке текстовых слоев:`, outerError);
      }

      const textTime = Date.now() - textStartTime;
      Logger.info(`✅ Обработано ${textLayers.length} текстовых слоев (${textTime}ms)`);
      logTiming('Обработка текстов завершена');
      
      // Отправляем тайминг в UI
      figma.ui.postMessage({
        type: 'log',
        message: `⏱️ Обработка текстов: ${(textTime / 1000).toFixed(2)}s`
      });
    }

    // Обработка ELabelGroup: установка рейтинга в #ProductRating и Variant Property "Rating"
    // Если в сниппете есть значение #ProductRating, применяем его к текстовому элементу #ProductRating
    // Если в сниппете нет #ProductRating (нет ELabelRating в mhtml), устанавливаем Rating=false в инстансе ELabelGroup
    Logger.debug(`🔍 [ELabelGroup Logic] Начало обработки ELabelGroup для сниппетов...`);
    Logger.debug(`🔍 [ELabelGroup Logic] Количество контейнеров: ${finalContainerMap.size}`);
    
    // Функция для поиска инстанса ELabelGroup в контейнере
    const findELabelGroupInstance = (node: BaseNode): InstanceNode | null => {
      if (node.type === 'INSTANCE' && node.name === 'ELabelGroup' && !node.removed) {
        return node as InstanceNode;
      }
      
      if ('children' in node && node.children) {
        for (const child of node.children) {
          const found = findELabelGroupInstance(child);
          if (found) return found;
        }
      }
      
      return null;
    };
    
    // Функция для поиска текстового элемента #ProductRating в контейнере
    const findProductRatingTextLayer = (node: BaseNode): TextNode | null => {
      if (node.type === 'TEXT' && node.name === '#ProductRating' && !node.removed) {
        return node as TextNode;
      }
      
      if ('children' in node && node.children) {
        for (const child of node.children) {
          const found = findProductRatingTextLayer(child);
          if (found) return found;
        }
      }
      
      return null;
    };
    
    // Группируем контейнеры по их ID и проверяем наличие поля #ProductRating в соответствующих строках
    const eLabelGroupContainersMap = new Map<string, { 
      row: { [key: string]: string } | null; 
      container: BaseNode | null;
      hasProductRating: boolean;
      productRatingValue: string;
    }>();
    
    // Проходим по всем контейнерам и их соответствующим строкам
    for (const [containerKey, layers] of finalContainerMap) {
      if (!layers || layers.length === 0) continue;
      
      // Находим контейнер сниппета (первый слой должен иметь родителя-контейнер)
      let container: BaseNode | null = null;
      for (const layer of layers) {
        if (layer.removed) continue;
        let current: BaseNode | null = layer.parent;
        while (current) {
          if (brandSnippetContainerNames.includes(current.name)) {
            container = current;
            break;
          }
          current = current.parent;
        }
        if (container) break;
      }
      
      if (!container) continue;
      
      // Определяем индекс строки для этого контейнера
      const containerIndex = Array.from(finalContainerMap.keys()).indexOf(containerKey);
      const rowIndex = containerIndex % rows.length;
      const row = rows[rowIndex];
      
      // Проверяем наличие поля #ProductRating
      const productRatingValue = row && row['#ProductRating'] ? String(row['#ProductRating']).trim() : '';
      const hasProductRating = productRatingValue !== '';
      
      // Сохраняем информацию о всех контейнерах
      eLabelGroupContainersMap.set(containerKey, { 
        row: row, 
        container: container,
        hasProductRating: hasProductRating,
        productRatingValue: productRatingValue
      });
    }
    
    // Обрабатываем каждый контейнер
    for (const [containerKey, data] of eLabelGroupContainersMap) {
      if (!data.container) continue;
      
      const containerName = data.container.name || 'Unknown';
      Logger.debug(`   📦 Контейнер "${containerName}" (${containerKey}): hasProductRating=${data.hasProductRating}, productRatingValue="${data.productRatingValue}"`);
      
      // Ищем инстанс ELabelGroup в контейнере
      const eLabelGroupInstance = findELabelGroupInstance(data.container);
      
      if (data.hasProductRating) {
        // Если есть значение #ProductRating, применяем его к текстовому элементу #ProductRating
        Logger.debug(`      ✅ Найдено значение #ProductRating: "${data.productRatingValue}"`);
        
        // Ищем текстовый элемент #ProductRating в контейнере
        const productRatingTextLayer = findProductRatingTextLayer(data.container);
        
        if (productRatingTextLayer) {
          try {
            // Загружаем шрифт для текстового элемента перед применением текста
            const fontName = productRatingTextLayer.fontName;
            if (fontName && typeof fontName === 'object' && fontName.family && fontName.style) {
              await figma.loadFontAsync({ family: fontName.family, style: fontName.style });
            }
            
            // Применяем значение к текстовому элементу
            productRatingTextLayer.characters = data.productRatingValue;
            Logger.debug(`      ✅ Применено значение "${data.productRatingValue}" к текстовому элементу #ProductRating`);
          } catch (e) {
            Logger.error(`      ❌ Ошибка применения значения к #ProductRating:`, e);
          }
        } else {
          Logger.warn(`      ⚠️ Текстовый элемент #ProductRating не найден в контейнере "${containerName}"`);
        }
        
        // Если есть инстанс ELabelGroup, устанавливаем Rating=true (если нужно)
        if (eLabelGroupInstance) {
          Logger.debug(`      🔧 Устанавливаем Rating=true для инстанса "ELabelGroup"`);
          processVariantProperty(eLabelGroupInstance, 'Rating=true', '#ProductRating');
        }
      } else {
        // Если нет значения #ProductRating, устанавливаем Rating=false в инстансе ELabelGroup
        Logger.debug(`      ⚠️ Значение #ProductRating не найдено, устанавливаем Rating=false`);
        
        if (eLabelGroupInstance) {
          Logger.debug(`      ✅ Найден инстанс "ELabelGroup" в контейнере "${containerName}"`);
          Logger.debug(`      🔧 Устанавливаем Rating=false для инстанса "ELabelGroup"`);
          processVariantProperty(eLabelGroupInstance, 'Rating=false', '#ProductRating');
        } else {
          Logger.debug(`      ⚠️ Инстанс "ELabelGroup" не найден в контейнере "${containerName}"`);
        }
      }
    }

    // Обработка EPriceBarometer: установка Variant Properties "Barometer" для ELabelGroup и "view" для EPriceBarometer
    Logger.debug(`🔍 [EPriceBarometer Logic] Начало обработки EPriceBarometer для сниппетов...`);
    Logger.debug(`🔍 [EPriceBarometer Logic] Количество контейнеров: ${finalContainerMap.size}`);
    
    // Функция для поиска инстанса EPriceBarometer в контейнере
    const findEPriceBarometerInstance = (node: BaseNode): InstanceNode | null => {
      if (node.type === 'INSTANCE' && node.name === 'EPriceBarometer' && !node.removed) {
        return node as InstanceNode;
      }
      
      if ('children' in node && node.children) {
        for (const child of node.children) {
          const found = findEPriceBarometerInstance(child);
          if (found) return found;
        }
      }
      
      return null;
    };
    
    // Группируем контейнеры по их ID и проверяем наличие полей EPriceBarometer в соответствующих строках
    const ePriceBarometerContainersMap = new Map<string, { 
      row: { [key: string]: string } | null; 
      container: BaseNode | null;
      hasBarometer: boolean;
      barometerView: string | null;
    }>();
    
    // Проходим по всем контейнерам и их соответствующим строкам
    for (const [containerKey, layers] of finalContainerMap) {
      if (!layers || layers.length === 0) continue;
      
      // Находим контейнер сниппета (первый слой должен иметь родителя-контейнер)
      let container: BaseNode | null = null;
      for (const layer of layers) {
        if (layer.removed) continue;
        let current: BaseNode | null = layer.parent;
        while (current) {
          if (brandSnippetContainerNames.includes(current.name)) {
            container = current;
            break;
          }
          current = current.parent;
        }
        if (container) break;
      }
      
      if (!container) continue;
      
      // Определяем индекс строки для этого контейнера
      const containerIndex = Array.from(finalContainerMap.keys()).indexOf(containerKey);
      const rowIndex = containerIndex % rows.length;
      const row = rows[rowIndex];
      
      // Проверяем наличие полей #ELabelGroup_Barometer и #EPriceBarometer_View
      const hasBarometer = row && row['#ELabelGroup_Barometer'] === 'true';
      const barometerView = row && row['#EPriceBarometer_View'] ? String(row['#EPriceBarometer_View']).trim() : null;
      
      // Сохраняем информацию о всех контейнерах
      ePriceBarometerContainersMap.set(containerKey, { 
        row: row, 
        container: container,
        hasBarometer: hasBarometer,
        barometerView: barometerView
      });
    }
    
    // Обрабатываем каждый контейнер
    for (const [containerKey, data] of ePriceBarometerContainersMap) {
      if (!data.container) continue;
      
      const containerName = data.container.name || 'Unknown';
      Logger.debug(`   📦 Контейнер "${containerName}" (${containerKey}): hasBarometer=${data.hasBarometer}, barometerView="${data.barometerView || 'null'}"`);
      
      // 1. Обработка ELabelGroup.Barometer
      const eLabelGroupInstance = findELabelGroupInstance(data.container);
      if (eLabelGroupInstance) {
        if (data.hasBarometer) {
          Logger.debug(`      🔧 Устанавливаем Barometer=true для инстанса "ELabelGroup"`);
          processVariantProperty(eLabelGroupInstance, 'Barometer=true', '#ELabelGroup_Barometer');
        } else {
          Logger.debug(`      🔧 Устанавливаем Barometer=false для инстанса "ELabelGroup"`);
          processVariantProperty(eLabelGroupInstance, 'Barometer=false', '#ELabelGroup_Barometer');
        }
      } else {
        Logger.debug(`      ⚠️ Инстанс "ELabelGroup" не найден в контейнере "${containerName}" для установки Barometer`);
      }
      
      // 2. Обработка EPriceBarometer.view
      if (data.hasBarometer && data.barometerView) {
        const ePriceBarometerInstance = findEPriceBarometerInstance(data.container);
        if (ePriceBarometerInstance) {
          Logger.debug(`      ✅ Найден инстанс "EPriceBarometer" в контейнере "${containerName}"`);
          
          // Диагностика: логируем все Component Properties
          Logger.debug(`      🔍 Диагностика Component Properties для инстанса "EPriceBarometer":`);
          debugComponentProperties(ePriceBarometerInstance);
          
          // Выводим все свойства инстанса для отладки
          Logger.debug(`      📋 Все свойства инстанса "EPriceBarometer" для отладки:`);
          const allProps = ePriceBarometerInstance.componentProperties;
          let viewPropertyDetails: {
            key: string;
            type: string;
            currentValue: string | boolean | number;
            options: readonly string[] | null;
            fullProperty: InstanceNode['componentProperties'][string];
          } | null = null;
          
          for (const propKey in allProps) {
            if (Object.prototype.hasOwnProperty.call(allProps, propKey)) {
              const prop = allProps[propKey];
              if (prop && typeof prop === 'object') {
                const propKeyWithoutId = propKey.split('#')[0];
                
                if ('options' in prop) {
                  const propOptions = prop.options as readonly string[];
                  const currentValue = 'value' in prop ? prop.value : 'N/A';
                  Logger.debug(`         - "${propKey}" (variant): текущее="${currentValue}", опции=[${propOptions.map(o => String(o)).join(', ')}]`);
                  
                  // Сохраняем детали свойства View для специального логирования
                  if (propKeyWithoutId === 'View' || propKey.startsWith('View')) {
                    viewPropertyDetails = {
                      key: propKey,
                      type: 'variant',
                      currentValue: currentValue,
                      options: propOptions,
                      fullProperty: prop
                    };
                  }
                } else if ('value' in prop) {
                  const currentValue = prop.value;
                  const valueType = typeof currentValue;
                  Logger.debug(`         - "${propKey}" (${valueType}): текущее="${currentValue}"`);
                  
                  // Сохраняем детали свойства View для специального логирования
                  if (propKeyWithoutId === 'View' || propKey.startsWith('View')) {
                    viewPropertyDetails = {
                      key: propKey,
                      type: valueType,
                      currentValue: currentValue,
                      options: null,
                      fullProperty: prop
                    };
                  }
                }
              }
            }
          }
          
          // Специальное логирование для свойства View
          if (viewPropertyDetails) {
            Logger.debug(`      🎯 ДЕТАЛЬНАЯ ИНФОРМАЦИЯ О СВОЙСТВЕ "View":`);
            Logger.debug(`         - Ключ свойства: "${viewPropertyDetails.key}"`);
            Logger.debug(`         - Тип свойства: ${viewPropertyDetails.type}`);
            Logger.debug(`         - Текущее значение: "${viewPropertyDetails.currentValue}"`);
            if (viewPropertyDetails.options) {
              Logger.debug(`         - ✅ Это variant property с options:`);
              Logger.debug(`         - 📝 Все доступные значения для View: [${viewPropertyDetails.options.map((o: string) => `"${String(o)}"`).join(', ')}]`);
              Logger.debug(`         - 📊 Количество вариантов: ${viewPropertyDetails.options.length}`);
            } else {
              Logger.debug(`         - ⚠️ Это НЕ variant property (нет options)`);
              const propStr = viewPropertyDetails.fullProperty && typeof viewPropertyDetails.fullProperty === 'object' 
                ? JSON.stringify(viewPropertyDetails.fullProperty, null, 2)
                : String(viewPropertyDetails.fullProperty);
              Logger.debug(`         - 🔍 Полная структура свойства:`, propStr);
            }
          } else {
            Logger.warn(`      ⚠️ Свойство "View" не найдено в componentProperties!`);
          }
          
          // Устанавливаем свойство View (с заглавной буквы, как показано в логах)
          // Это строковое свойство компонента, обрабатываем его напрямую
          const targetViewValue = data.barometerView;
          
          Logger.debug(`      🔧 Устанавливаем View=${targetViewValue} для инстанса "EPriceBarometer" (строковое свойство)`);
          
          // Ищем полный ключ свойства View в componentProperties (используем уже объявленную переменную allProps)
          let viewPropertyKey: string | null = null;
          
          for (const propKey in allProps) {
            if (Object.prototype.hasOwnProperty.call(allProps, propKey)) {
              const propKeyWithoutId = propKey.split('#')[0];
              if (propKeyWithoutId === 'View' || propKey.startsWith('View')) {
                viewPropertyKey = propKey;
                Logger.debug(`      🔍 Найден ключ свойства: "${viewPropertyKey}"`);
                break;
              }
            }
          }
          
          // Используем функцию processStringProperty для установки строкового свойства
          const viewSet = processStringProperty(
            ePriceBarometerInstance, 
            'View', 
            targetViewValue, 
            '#EPriceBarometer_View',
            viewPropertyKey || undefined
          );
          
          if (!viewSet) {
            Logger.warn(`      ⚠️ Не удалось установить свойство "View" в инстансе "EPriceBarometer"`);
            Logger.warn(`      💡 Возможно, значение "${targetViewValue}" не существует в вариантах компонента. Проверьте доступные варианты.`);
          }
        } else {
          Logger.debug(`      ⚠️ Инстанс "EPriceBarometer" не найден в контейнере "${containerName}"`);
        }
      }
    }

    // ОПТИМИЗАЦИЯ 5: Загрузка изображений с кешем, таймаутом и пулом параллелизма
    if (imageLayers.length > 0) {
      const imagesStartTime = Date.now();
      Logger.info(`🖼️ Загружаем ${imageLayers.length} изображений с ограниченным параллелизмом...`);
      
      // Обертываем весь блок обработки изображений в try-catch для защиты от ошибок
      try {

      const imageCache: { [url: string]: Promise<Uint8Array> } = {};
      // Таймаут для загрузки изображения (мс) - увеличен для надежности
      const IMAGE_TIMEOUT_MS = 30000;
      // Максимальный размер изображения (10MB) для предотвращения перегрузки WebAssembly
      const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
      
      const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
        return new Promise(function(resolve, reject) {
          let settled = false;
          const timer = setTimeout(function() {
            if (!settled) {
              settled = true;
              reject(new Error('Timeout ' + timeoutMs + 'ms'));
            }
          }, timeoutMs);
          fetch(url).then(function(res) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(res);
          }).catch(function(err) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(err);
          });
        });
      };
      
      // Функция проверки формата изображения по сигнатурам
      const isValidImageFormat = (bytes: Uint8Array): boolean => {
        if (!bytes || bytes.length < 4) return false;
        // JPEG: FF D8 FF
        if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return true;
        // PNG: 89 50 4E 47
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return true;
        // GIF: 47 49 46 38
        if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true;
        // WebP: RIFF...WEBP
        if (bytes.length >= 12 && 
            bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
            bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return true;
        return false;
      };
      
      const loadImageCached = (url: string): Promise<Uint8Array> => {
        if (!imageCache[url]) {
          imageCache[url] = (async () => {
            // Первая попытка с таймаутом, затем одна попытка без таймаута
            let response: Response;
            try {
              response = await fetchWithTimeout(url, IMAGE_TIMEOUT_MS);
            } catch (e) {
              Logger.warn('⏱️ Повторная попытка загрузки без таймаута:', url, e);
              response = await fetch(url);
            }
            if (!response.ok) {
              throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            
            // ВАЛИДАЦИЯ: Проверяем, что данные не пустые
            if (!bytes || bytes.length === 0) {
              throw new Error(`Пустой ответ от сервера для: ${url}`);
            }
            
            // ВАЛИДАЦИЯ: Проверяем размер изображения
            if (bytes.length > MAX_IMAGE_SIZE) {
              throw new Error(`Изображение слишком большое (${Math.round(bytes.length / 1024 / 1024)}MB, максимум ${MAX_IMAGE_SIZE / 1024 / 1024}MB): ${url}`);
            }
            
            // ВАЛИДАЦИЯ: Проверяем формат изображения
            if (!isValidImageFormat(bytes)) {
              throw new Error(`Неподдерживаемый формат изображения для: ${url}`);
            }
            
            return bytes;
          })();
        }
        return imageCache[url];
      };

      // Обрабатываем изображения с ограниченным параллелизмом (3 одновременно)
      const MAX_CONCURRENT_IMAGES = 3;
      // let imagesProcessed = 0;
      let imagesSuccessful = 0;
      let imagesFailed = 0;
      
      // Хранилище для списка фавиконок из спрайта
      // Формат: { urls: string[], currentIndex: number }
      // currentIndex - текущий индекс в списке (увеличивается для каждого следующего сниппета)
      let spriteFaviconList: { urls: string[]; currentIndex: number } | null = null;
      
      // Функция обработки одного изображения
      const processImage = async (item: typeof imageLayers[0], index: number): Promise<void> => {
        Logger.debug(`🖼️ [${index + 1}/${imageLayers.length}] Обработка изображения "${item.fieldName}"`);
        
        try {
          // ============================================
          // ЧАСТЬ 1: ПАРСИНГ URL (СОХРАНЯЕМ БЕЗ ИЗМЕНЕНИЙ)
          // ============================================
          
          // Простая проверка наличия значения
          if (!item.fieldValue || typeof item.fieldValue !== 'string') {
            Logger.warn(`⚠️ Пропускаем "${item.fieldName}" - нет URL`);
            imagesFailed++;
            return;
          }
          
          // Парсим URL, позицию спрайта и размер из формата "url|position|size" или "url|position"
          // Также проверяем формат "SPRITE_LIST:url1|url2|url3|..." для списка фавиконок
          let imgUrl = String(item.fieldValue).trim();
          let spritePosition: string | null = null;
          let spriteSize: string | null = null;
          
          // Проверяем, является ли это фавиконкой (для применения логики списка)
          const isFavicon = item.fieldName.toLowerCase().includes('favicon');
          
          // Дополнительное логирование для фавиконок
          if (isFavicon) {
            Logger.debug(`   🔍 [FAVICON DEBUG] fieldName="${item.fieldName}", fieldValue="${item.fieldValue?.substring(0, 100)}...", rowIndex=${item.rowIndex}, spriteFaviconList=${spriteFaviconList ? `exists (index=${spriteFaviconList.currentIndex}/${spriteFaviconList.urls.length})` : 'null'}`);
          }
          
          // Проверяем, является ли это списком фавиконок из спрайта
          if (imgUrl.startsWith('SPRITE_LIST:')) {
            if (!isFavicon) {
              Logger.warn(`   ⚠️ SPRITE_LIST найден в не-фавиконке "${item.fieldName}", пропускаем`);
              imagesFailed++;
              return;
            }
            const listData = imgUrl.substring('SPRITE_LIST:'.length);
            const urls = listData.split('|').filter(url => url.trim().length > 0);
            if (urls.length > 0) {
              // Проверяем, можем ли мы использовать существующий список
              // Если список уже существует и currentIndex в пределах списка, используем следующий URL
              if (spriteFaviconList && spriteFaviconList.currentIndex < spriteFaviconList.urls.length) {
                // Используем существующий список - берем URL по текущему индексу
                imgUrl = spriteFaviconList.urls[spriteFaviconList.currentIndex];
                Logger.debug(`   🎯 Используем фавиконку из существующего списка для строки ${item.rowIndex} (индекс ${spriteFaviconList.currentIndex}/${spriteFaviconList.urls.length - 1}): ${imgUrl.substring(0, 80)}...`);
                // Увеличиваем индекс для следующего сниппета
                spriteFaviconList.currentIndex++;
              } else {
                // Создаем новый список (или список закончился, начинаем заново)
                spriteFaviconList = { urls: urls, currentIndex: 1 }; // currentIndex = 1, т.к. используем urls[0]
                imgUrl = urls[0];
                Logger.debug(`   🎯 Список фавиконок из спрайта обнаружен для строки ${item.rowIndex}: ${urls.length} адресов, применяем первый (индекс 0): ${imgUrl.substring(0, 80)}...`);
              }
              
              // Обновляем ShopName для текущего сниппета на основе используемого URL
              try {
                const urlMatch = imgUrl.match(/\/favicon\/v2\/([^?]+)/);
                if (urlMatch && urlMatch[1]) {
                  const decodedHost = decodeURIComponent(urlMatch[1]);
                  const hostUrl = new URL(decodedHost.startsWith('http') ? decodedHost : `https://${decodedHost}`);
                  const hostname = hostUrl.hostname;
                  // Обновляем ShopName в данных строки, если он еще не установлен
                  if (item.row) {
                    item.row['#ShopName'] = hostname;
                    item.row['#OrganicHost'] = hostname;
                    
                    // Обновляем ShopName в текстовых слоях, если они уже обработаны
                    // Ищем текстовые слои с тем же rowIndex и полем #ShopName
                    const shopNameLayers = textLayersAll.filter(tl => 
                      tl.rowIndex === item.rowIndex && 
                      tl.fieldName.toLowerCase().includes('shopname')
                    );
                    for (const shopLayer of shopNameLayers) {
                      try {
                        if (shopLayer.layer.type === 'TEXT') {
                          (shopLayer.layer as TextNode).characters = hostname;
                        } else if (shopLayer.layer.type === 'INSTANCE') {
                          const instance = shopLayer.layer as InstanceNode;
                          if ('children' in instance && instance.children) {
                            for (const child of instance.children) {
                              if (child.type === 'TEXT' && !child.removed) {
                                if (child.name === shopLayer.fieldName || child.name.toLowerCase().includes('shopname')) {
                                  (child as TextNode).characters = hostname;
                                  break;
                                }
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Игнорируем ошибки обновления текста
                      }
                    }
                  }
                }
              } catch (e) {
                // Игнорируем ошибки парсинга URL
              }
            } else {
              Logger.warn(`   ⚠️ Пустой список фавиконок в SPRITE_LIST`);
              imagesFailed++;
              return;
            }
          } else if (isFavicon && spriteFaviconList) {
            // Используем URL из сохраненного списка на основе currentIndex
            if (spriteFaviconList.currentIndex < spriteFaviconList.urls.length) {
              // Используем URL из списка по текущему индексу
              imgUrl = spriteFaviconList.urls[spriteFaviconList.currentIndex];
              Logger.debug(`   🎯 Используем фавиконку из списка для строки ${item.rowIndex} (индекс ${spriteFaviconList.currentIndex}/${spriteFaviconList.urls.length - 1}): ${imgUrl.substring(0, 80)}...`);
              // Увеличиваем индекс для следующего сниппета
              spriteFaviconList.currentIndex++;
            } else {
              // Список закончился - сбрасываем
              Logger.debug(`   ⚠️ Список фавиконок закончился (индекс ${spriteFaviconList.currentIndex} >= ${spriteFaviconList.urls.length}), сбрасываем список`);
              spriteFaviconList = null;
              // Продолжаем обработку как обычную фавиконку (но у нас нет URL, так что это ошибка)
              Logger.warn(`   ⚠️ Нет URL для фавиконки в строке ${item.rowIndex}`);
              imagesFailed++;
              return;
            }
            
            // Обновляем ShopName для текущего сниппета на основе соответствующего URL из списка
            try {
              const urlMatch = imgUrl.match(/\/favicon\/v2\/([^?]+)/);
              if (urlMatch && urlMatch[1]) {
                const decodedHost = decodeURIComponent(urlMatch[1]);
                const hostUrl = new URL(decodedHost.startsWith('http') ? decodedHost : `https://${decodedHost}`);
                const hostname = hostUrl.hostname;
                // Обновляем ShopName в данных строки
                if (item.row) {
                  item.row['#ShopName'] = hostname;
                  item.row['#OrganicHost'] = hostname;
                  
                  // Обновляем ShopName в текстовых слоях, если они уже обработаны
                  // Ищем текстовые слои с тем же rowIndex и полем #ShopName
                  const shopNameLayers = textLayersAll.filter(tl => 
                    tl.rowIndex === item.rowIndex && 
                    tl.fieldName.toLowerCase().includes('shopname')
                  );
                  for (const shopLayer of shopNameLayers) {
                    try {
                      if (shopLayer.layer.type === 'TEXT') {
                        (shopLayer.layer as TextNode).characters = hostname;
                      } else if (shopLayer.layer.type === 'INSTANCE') {
                        const instance = shopLayer.layer as InstanceNode;
                        if ('children' in instance && instance.children) {
                          for (const child of instance.children) {
                            if (child.type === 'TEXT' && !child.removed) {
                              if (child.name === shopLayer.fieldName || child.name.toLowerCase().includes('shopname')) {
                                (child as TextNode).characters = hostname;
                                break;
                              }
                            }
                          }
                        }
                      }
                    } catch (e) {
                      // Игнорируем ошибки обновления текста
                    }
                  }
                }
              }
            } catch (e) {
              // Игнорируем ошибки парсинга URL
            }
          } else {
            // Обычный формат: проверяем на спрайт с позицией
            const spriteMatch = imgUrl.match(/^(.+)\|(.+?)(?:\|(.+))?$/);
            if (spriteMatch) {
              imgUrl = spriteMatch[1];
              spritePosition = spriteMatch[2].trim();
              spriteSize = spriteMatch[3] ? spriteMatch[3].trim() : null;
              Logger.debug(`   🎯 Спрайт обнаружен, позиция: ${spritePosition}${spriteSize ? `, размер: ${spriteSize}` : ''}`);
            }
            // Не сбрасываем список для обычных фавиконок, так как они могут быть из той же серии
            // Список будет сброшен только если он закончился или встретили новый SPRITE_LIST:
          }
          
          // Простая проверка формата URL
          if (!imgUrl.startsWith('http://') && !imgUrl.startsWith('https://') && !imgUrl.startsWith('//')) {
            Logger.warn(`⚠️ Пропускаем "${item.fieldName}" - некорректный URL: ${imgUrl.substring(0, 50)}...`);
            imagesFailed++;
            return;
          }
          
          // Нормализуем URL
          if (imgUrl.startsWith('//')) {
            imgUrl = 'https:' + imgUrl;
          }
          
          Logger.debug(`   📍 URL: ${imgUrl.substring(0, 80)}...`);
          
          // ============================================
          // ЧАСТЬ 2: ЗАГРУЗКА И ПРИМЕНЕНИЕ ИЗОБРАЖЕНИЯ
          // ============================================
          
          // Загружаем байты изображения
          let imageBytes: Uint8Array;
          try {
            imageBytes = await loadImageCached(imgUrl);
            Logger.debug(`   ✅ Загружено ${Math.round(imageBytes.length / 1024)}KB`);
          } catch (loadError) {
            Logger.error(`   ❌ Ошибка загрузки:`, loadError);
            imagesFailed++;
            return;
          }
          
          // Проверяем слой перед обработкой
          if (item.layer.removed) {
            Logger.warn(`   ⚠️ Слой удален, пропускаем`);
            imagesFailed++;
            return;
          }
          
          const layerType = item.layer.type;
          if (layerType !== 'RECTANGLE' && layerType !== 'ELLIPSE' && layerType !== 'POLYGON') {
            Logger.warn(`   ⚠️ Неподдерживаемый тип слоя: ${layerType}`);
            imagesFailed++;
            return;
          }
          
          // Создаем изображение в Figma
          let figmaImage: Image;
          try {
            figmaImage = figma.createImage(imageBytes);
            if (!figmaImage || !figmaImage.hash) {
              throw new Error('Не удалось создать изображение');
            }
            Logger.debug(`   ✅ Изображение создано в Figma`);
          } catch (createError) {
            Logger.error(`   ❌ Ошибка создания изображения:`, createError);
            imagesFailed++;
            return;
          }
          
          // Применяем изображение к слою с поддержкой спрайтов
          try {
            if (spritePosition && (layerType === 'RECTANGLE' || layerType === 'ELLIPSE' || layerType === 'POLYGON')) {
              const layer = item.layer as RectangleNode | EllipseNode | PolygonNode;
              
              let bgOffsetX = 0;
              let bgOffsetY = 0;
              
              // Парсим все значения в px из строки
              const pxValues = spritePosition.match(/(-?\d+(?:\.\d+)?)px/g);
              if (pxValues) {
                if (pxValues.length === 1) {
                  const value = parseFloat(pxValues[0]);
                  const lowerPos = spritePosition.toLowerCase();
                  if (lowerPos.includes('x') && !lowerPos.includes('y')) {
                    bgOffsetX = value;
                  } else if (lowerPos.includes('y') && !lowerPos.includes('x')) {
                    bgOffsetY = value;
                  } else {
                    if (spritePosition.match(/0px\s*[-\d]/)) {
                      bgOffsetY = value;
                    } else {
                      bgOffsetX = value;
                    }
                  }
                } else if (pxValues.length >= 2) {
                  bgOffsetX = parseFloat(pxValues[0]) || 0;
                  bgOffsetY = parseFloat(pxValues[1]) || 0;
                }
              } else {
                const numValues = spritePosition.match(/(-?\d+(?:\.\d+)?)/g);
                if (numValues) {
                  if (numValues.length === 1) {
                    bgOffsetX = parseFloat(numValues[0]) || 0;
                  } else {
                    bgOffsetX = parseFloat(numValues[0]) || 0;
                    bgOffsetY = parseFloat(numValues[1]) || 0;
                  }
                }
              }
              
              const isHorizontalSprite = bgOffsetX !== 0 && bgOffsetY === 0;
              const isVerticalSprite = bgOffsetX === 0 && bgOffsetY !== 0;
              
              // Получаем размеры слоя для правильного масштабирования
              const layerWidth = layer.width;
              const layerHeight = layer.height;
              
              // Определяем размер одного элемента спрайта
              let spriteItemSize = 16; // По умолчанию
              
              // Если размер указан в данных (background-size из CSS)
              if (spriteSize) {
                const sizeMatch = spriteSize.match(/(\d+(?:\.\d+)?)px/i);
                if (sizeMatch) {
                  spriteItemSize = parseFloat(sizeMatch[1]) || 16;
                  Logger.debug(`   📏 Размер элемента спрайта из CSS: ${spriteItemSize}px`);
                }
              } else {
                if (isVerticalSprite && bgOffsetY !== 0) {
                  const absOffset = Math.abs(bgOffsetY);
                  if (absOffset % 32 === 0) spriteItemSize = 32;
                  else if (absOffset % 20 === 0) spriteItemSize = 20;
                  else if (absOffset % 16 === 0) spriteItemSize = 16;
                  else spriteItemSize = Math.min(layerWidth, layerHeight) || 16;
                } else if (isHorizontalSprite && bgOffsetX !== 0) {
                  const absOffset = Math.abs(bgOffsetX);
                  if (absOffset % 32 === 0) spriteItemSize = 32;
                  else if (absOffset % 20 === 0) spriteItemSize = 20;
                  else if (absOffset % 16 === 0) spriteItemSize = 16;
                  else spriteItemSize = Math.min(layerWidth, layerHeight) || 16;
                } else {
                  spriteItemSize = Math.min(layerWidth, layerHeight) || 16;
                }
                Logger.debug(`   📏 Размер элемента спрайта вычислен: ${spriteItemSize}px`);
              }
              
              // Многоэтапное применение спрайта:
              // 1. Вычисляем масштаб для сохранения пропорций

              // Используем асинхронный метод getSizeAsync
              const imageSize = await figmaImage.getSizeAsync();
              const imageWidth = imageSize.width;
              const imageHeight = imageSize.height;
              
              // Масштаб = (размер слоя) / (размер элемента спрайта)
              // const scaleFactor = Math.min(layerWidth, layerHeight) / spriteItemSize;
              
              // Новая ширина и высота изображения с учетом масштаба
              // const scaledImageWidth = imageWidth * scaleFactor;
              // const scaledImageHeight = imageHeight * scaleFactor;
              
              // Logger.debug(`   📐 Спрайт: ${imageWidth}x${imageHeight} -> Элемент: ${spriteItemSize}px -> Слой: ${layerWidth}x${layerHeight} (Масштаб: ${scaleFactor.toFixed(2)})`);
              
              // Используем FILL с transform для точного позиционирования
              // В Figma transform матрица для заливки:
              // [scale_x, 0, offset_x]
              // [0, scale_y, offset_y]
              // offset в диапазоне 0..1 относительно размера изображения? Нет, относительно заливки.
              
              // В Figma API для ImagePaint:
              // scaleMode: 'FILL' - заполняет, обрезая лишнее
              // scaleMode: 'FIT' - помещает целиком
              // scaleMode: 'CROP' - позволяет задать transform
              
              // Для спрайтов идеально подходит CROP
              
              // Вычисляем матрицу трансформации для CROP
              // Нам нужно показать область размером spriteItemSize x spriteItemSize
              // которая находится по смещению bgOffsetX, bgOffsetY
              
              // Нормализуем смещения (они могут быть отрицательными в CSS)
              const targetX = -bgOffsetX; // Смещение X в CSS отрицательное -> положительная координата на картинке
              const targetY = -bgOffsetY; // Смещение Y в CSS отрицательное -> положительная координата на картинке
              
              // Вычисляем ширину и высоту видимой области в долях от всего изображения (0..1)
              // Мы хотим показать область размером spriteItemSize
              const visibleW = spriteItemSize / imageWidth;
              const visibleH = spriteItemSize / imageHeight;
              
              // Вычисляем смещение видимой области в долях (0..1)
              const offsetX = targetX / imageWidth;
              const offsetY = targetY / imageHeight;
              
              Logger.debug(`   ✂️ CROP параметры: offset=(${offsetX.toFixed(4)}, ${offsetY.toFixed(4)}), size=(${visibleW.toFixed(4)}, ${visibleH.toFixed(4)})`);
              
              // Матрица трансформации для CROP:
              // [visibleW, 0, offsetX]
              // [0, visibleH, offsetY]
              // Это вырежет нужный кусок и растянет его на весь слой
              
              const newPaint: ImagePaint = {
              type: 'IMAGE',
                scaleMode: 'CROP',
              imageHash: figmaImage.hash,
                imageTransform: [
                  [visibleW, 0, offsetX],
                  [0, visibleH, offsetY]
                ]
              };
              
              layer.fills = [newPaint];
              Logger.debug(`   ✅ Спрайт применен успешно (CROP)`);
            } else {
              // Обычное изображение
              const newPaint: ImagePaint = {
                type: 'IMAGE',
                scaleMode: 'FILL',
                imageHash: figmaImage.hash
              };
              (item.layer as RectangleNode | EllipseNode | PolygonNode).fills = [newPaint];
              Logger.debug(`   ✅ Изображение применено (FILL)`);
            }
            
            imagesSuccessful++;
          } catch (applyError) {
            Logger.error(`   ❌ Ошибка применения изображения:`, applyError);
            imagesFailed++;
          }
          
        } catch (error) {
          Logger.error(`   ❌ Ошибка обработки изображения "${item.fieldName}":`, error);
          imagesFailed++;
        } finally {
          // imagesProcessed++;
        }
      };
      
      // Запускаем пул обработчиков
      const processImagesPool = async () => {
        const queue = [...imageLayers];
        const workers: Promise<void>[] = [];
        
        for (let i = 0; i < MAX_CONCURRENT_IMAGES; i++) {
          workers.push((async () => {
            while (queue.length > 0) {
              const item = queue.shift();
              if (item) {
                const index = imageLayers.length - queue.length - 1;
                await processImage(item, index);
              }
            }
          })());
        }
        
        await Promise.all(workers);
      };
      
      await processImagesPool();
      
      const imagesTime = Date.now() - imagesStartTime;
      Logger.info(`✅ Обработка изображений завершена: ${imagesSuccessful} успешно, ${imagesFailed} ошибок (${imagesTime}ms)`);
      logTiming('Обработка изображений завершена');
      
      // Отправляем статистику и тайминг в UI
      figma.ui.postMessage({
        type: 'stats',
        stats: {
          processedInstances: nextRowIndex,
          totalInstances: finalContainerMap.size,
          successfulImages: imagesSuccessful,
          skippedImages: imageLayers.length - imagesSuccessful - imagesFailed,
          failedImages: imagesFailed
        }
      });
      
      figma.ui.postMessage({
        type: 'log',
        message: `⏱️ Обработка изображений: ${(imagesTime / 1000).toFixed(2)}s`
      });
      
      } catch (imagesError) {
        Logger.error(`❌ Общая ошибка обработки изображений:`, imagesError);
      }
    }
    
    const totalTime = Date.now() - startTime;
    Logger.info(`🎉 Готово! Обработано ${nextRowIndex} элементов за ${(totalTime / 1000).toFixed(2)}s`);
    
    figma.ui.postMessage({
      type: 'done',
      count: nextRowIndex
    });
  }
};

