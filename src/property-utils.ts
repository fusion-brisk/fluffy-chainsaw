import { Logger } from './logger';

// Обработка boolean-свойств
// Парсит строковые значения из CSV/JSON и применяет через setProperties
// actualPropertyKey - полное имя свойства с ID (например, "Brand#22092:0"), если передан, используется для setProperties
// propertyName - простое имя свойства (например, "Brand"), используется для логирования
export function processBooleanProperty(instance: InstanceNode, propertyName: string, targetValue: string, fieldName: string, actualPropertyKey?: string): boolean {
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

// Обработка строковых свойств компонентов (не boolean, не variant property с options)
export function processStringProperty(instance: InstanceNode, propertyName: string, targetValue: string, fieldName: string, actualPropertyKey?: string): boolean {
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
export function processVariantProperty(instance: InstanceNode, value: string, fieldName: string): boolean {
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

