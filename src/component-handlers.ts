import { COMPONENT_CONFIG, SNIPPET_CONTAINER_NAMES } from './config';
import { Logger } from './logger';
import { processVariantProperty, processStringProperty, processVariantPropertyRecursive } from './property-utils';

// Интерфейс для данных обработки
interface HandlerContext {
  container: BaseNode;
  containerKey: string;
  row: { [key: string]: string } | null;
}

// Обработка Brand (если нет значения, выключаем)
export function handleBrandLogic(context: HandlerContext): void {
  const { container, containerKey: _containerKey, row } = context;
  if (!container || !row) return;

  const containerName = container.name || 'Unknown';
  
  // Проверяем наличие #Brand в строке (значение не пустое)
  const brandValue = row['#Brand'];
  // Игнорируем Variant Property синтаксис для определения наличия значения
  const isVariantPropertySyntax = brandValue && /^[^=\s]+=.+$/.test(brandValue);
  const hasBrandValue = brandValue && brandValue.trim() !== '' && !isVariantPropertySyntax;

  if (!hasBrandValue) {
    Logger.debug(`   🔧 [Brand Logic] Устанавливаем Brand=false для контейнера "${containerName}"`);
    try {
      if (container.type === 'INSTANCE' && !container.removed) {
        const containerInstance = container as InstanceNode;
        if (SNIPPET_CONTAINER_NAMES.includes(containerInstance.name)) {
          processVariantPropertyRecursive(containerInstance, 'Brand=false', '#Brand', SNIPPET_CONTAINER_NAMES);
        }
      }
      
      if ('children' in container) {
        for (const child of container.children) {
          if (child.type === 'INSTANCE' && !child.removed) {
            const instance = child as InstanceNode;
            if (SNIPPET_CONTAINER_NAMES.includes(instance.name)) {
              processVariantPropertyRecursive(instance, 'Brand=false', '#Brand', SNIPPET_CONTAINER_NAMES);
            }
          }
        }
      }
    } catch (e) {
      Logger.error(`   ❌ Ошибка обработки Brand для контейнера "${containerName}":`, e);
    }
  }
}

// Поиск инстанса по имени
function findInstanceByName(node: BaseNode, name: string): InstanceNode | null {
  if (node.type === 'INSTANCE' && node.name === name && !node.removed) {
    return node as InstanceNode;
  }
  
  if ('children' in node && node.children) {
    for (const child of node.children) {
      const found = findInstanceByName(child, name);
      if (found) return found;
    }
  }
  
  return null;
}

// Поиск текстового слоя по имени
function findTextLayerByName(node: BaseNode, name: string): TextNode | null {
  if (node.type === 'TEXT' && node.name === name && !node.removed) {
    return node as TextNode;
  }
  
  if ('children' in node && node.children) {
    for (const child of node.children) {
      const found = findTextLayerByName(child, name);
      if (found) return found;
    }
  }
  
  return null;
}

// Обработка EPriceGroup
export async function handleEPriceGroup(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const config = COMPONENT_CONFIG.EPriceGroup;
  const ePriceGroupInstance = findInstanceByName(container, config.name);
  
  if (!ePriceGroupInstance) return;
  
  Logger.debug(`      ✅ Найден инстанс "${config.name}"`);
  
  // Discount
  const discountVal = row[config.properties.discount.dataField];
  const hasDiscount = discountVal === 'true';
  
  // ОТЛАДКА: выводим все свойства EPriceGroup чтобы понять какие есть варианты
  console.log(`🔍 [DEBUG EPriceGroup] Свойства инстанса "${ePriceGroupInstance.name}":`);
  const allProps = ePriceGroupInstance.componentProperties;
  for (const propKey in allProps) {
    if (Object.prototype.hasOwnProperty.call(allProps, propKey)) {
      const prop = allProps[propKey];
      if (prop && typeof prop === 'object') {
        const options = 'options' in prop ? (prop.options as string[]) : null;
        const value = 'value' in prop ? prop.value : 'N/A';
        const propType = 'type' in prop ? (prop as Record<string, unknown>).type : 'unknown';
        console.log(`   - "${propKey}": type=${propType}, value="${value}", options=${options ? `[${options.join(', ')}]` : 'нет'}`);
      }
    }
  }
  
  Logger.debug(`      💰 [EPriceGroup] Discount data: "${discountVal}", hasDiscount: ${hasDiscount}`);
  
  let discountSet = false;
  if (hasDiscount) {
    // Пробуем разные варианты названия свойства для true
    discountSet = processVariantProperty(ePriceGroupInstance, 'Discount=true', config.properties.discount.dataField);
    if (!discountSet) discountSet = processVariantProperty(ePriceGroupInstance, 'Discount=True', config.properties.discount.dataField);
    if (!discountSet) discountSet = processVariantProperty(ePriceGroupInstance, 'discount=true', config.properties.discount.dataField);
  } else {
    // Пробуем разные варианты для false
    discountSet = processVariantProperty(ePriceGroupInstance, 'Discount=false', config.properties.discount.dataField);
    if (!discountSet) discountSet = processVariantProperty(ePriceGroupInstance, 'Discount=False', config.properties.discount.dataField);
    if (!discountSet) discountSet = processVariantProperty(ePriceGroupInstance, 'discount=false', config.properties.discount.dataField);
  }
  console.log(`💰 [EPriceGroup] Discount=${hasDiscount}, результат установки: ${discountSet}`);
  Logger.debug(`      💰 [EPriceGroup] Discount=${hasDiscount} результат: ${discountSet}`);
  
  // Old Price
  const oldPriceVal = row[config.properties.oldPrice.dataField];
  const hasOldPrice = oldPriceVal === 'true';
  Logger.debug(`      💰 [EPriceGroup] OldPrice data: "${oldPriceVal}", hasOldPrice: ${hasOldPrice}`);
  
  let oldPriceSet = false;
  if (hasOldPrice) {
    // Пробуем разные варианты названия свойства
    oldPriceSet = processVariantProperty(ePriceGroupInstance, 'Old Price=true', config.properties.oldPrice.dataField);
    if (!oldPriceSet) oldPriceSet = processVariantProperty(ePriceGroupInstance, 'OldPrice=true', config.properties.oldPrice.dataField);
    if (!oldPriceSet) oldPriceSet = processVariantProperty(ePriceGroupInstance, 'Old_Price=true', config.properties.oldPrice.dataField);
  } else {
    // Пробуем разные варианты для false
    oldPriceSet = processVariantProperty(ePriceGroupInstance, 'Old Price=false', config.properties.oldPrice.dataField);
    if (!oldPriceSet) oldPriceSet = processVariantProperty(ePriceGroupInstance, 'OldPrice=false', config.properties.oldPrice.dataField);
    if (!oldPriceSet) oldPriceSet = processVariantProperty(ePriceGroupInstance, 'Old_Price=false', config.properties.oldPrice.dataField);
    if (!oldPriceSet) oldPriceSet = processVariantProperty(ePriceGroupInstance, 'old price=false', config.properties.oldPrice.dataField);
    if (!oldPriceSet) oldPriceSet = processVariantProperty(ePriceGroupInstance, 'oldprice=false', config.properties.oldPrice.dataField);
  }
  Logger.debug(`      💰 [EPriceGroup] Old Price=${hasOldPrice} результат: ${oldPriceSet}`);
  
  // Устанавливаем комбинированное свойство DISCOUNT + OLD PRICE
  // Это свойство контролирует видимость блока со скидкой и старой ценой
  const hasDiscountOrOldPrice = hasDiscount || hasOldPrice;
  let discountOldPriceSet = false;
  discountOldPriceSet = processVariantProperty(ePriceGroupInstance, `DISCOUNT + OLD PRICE=${hasDiscountOrOldPrice}`, '#DISCOUNT_OLD_PRICE');
  if (!discountOldPriceSet) {
    // Fallback варианты названия
    discountOldPriceSet = processVariantProperty(ePriceGroupInstance, `Discount + Old Price=${hasDiscountOrOldPrice}`, '#DISCOUNT_OLD_PRICE');
  }
  console.log(`💰 [EPriceGroup] DISCOUNT + OLD PRICE=${hasDiscountOrOldPrice}, результат: ${discountOldPriceSet}`);
  
  // ВАЖНО: После изменения вариантов EPriceGroup его структура могла измениться!
  // Нужно пере-найти EPriceGroup чтобы получить актуальную ссылку
  const freshEPriceGroup = findInstanceByName(container, 'EPriceGroup');
  const activeEPriceGroup = freshEPriceGroup || ePriceGroupInstance;
  console.log(`🔄 [EPriceGroup] Пере-поиск: ${freshEPriceGroup ? 'найден свежий' : 'используем старый'}`);
  
  // Устанавливаем значение текущей цены в EPrice через exposed property
  const priceValue = row['#OrganicPrice'];
  console.log(`🔍 [EPrice DEBUG] Ищем EPrice в EPriceGroup, priceValue="${priceValue}"`);
  
  // Ищем EPrice - это должен быть компонент текущей цены, НЕ старой (EPrice_view_old)
  let ePriceInstance: InstanceNode | null = null;
  
  if ('children' in activeEPriceGroup) {
    // Ищем все EPrice инстансы
    const allEPrices: InstanceNode[] = [];
    const findAllEPrice = (node: BaseNode) => {
      if (node.type === 'INSTANCE' && node.name === 'EPrice' && !node.removed) {
        allEPrices.push(node as InstanceNode);
      }
      if ('children' in node && node.children) {
        for (const child of node.children) {
          findAllEPrice(child);
        }
      }
    };
    findAllEPrice(activeEPriceGroup);
    
    console.log(`🔍 [EPrice DEBUG] Найдено ${allEPrices.length} EPrice инстансов`);
    
    // Выбираем первый EPrice который НЕ является старой ценой
    for (const ep of allEPrices) {
      // Проверяем родительский контейнер - если это "Discount + Old Price", пропускаем
      let parent = ep.parent;
      let isOldPrice = false;
      while (parent && parent.id !== activeEPriceGroup.id) {
        if (parent.name && (parent.name.includes('Old') || parent.name.includes('old'))) {
          isOldPrice = true;
          break;
        }
        parent = parent.parent;
      }
      
      if (!isOldPrice) {
        ePriceInstance = ep;
        console.log(`🔍 [EPrice DEBUG] Выбран EPrice для текущей цены (не Old Price)`);
        break;
      } else {
        console.log(`🔍 [EPrice DEBUG] Пропущен EPrice (Old Price): parent=${ep.parent?.name}`);
      }
    }
  }
  
  console.log(`🔍 [EPrice DEBUG] Итоговый EPrice: ${ePriceInstance ? ePriceInstance.name : 'не найден'}`);
  
  if (ePriceInstance && ePriceInstance.componentProperties) {
    console.log(`🔍 [EPrice DEBUG] Свойства EPrice:`);
    for (const pk in ePriceInstance.componentProperties) {
      const prop = ePriceInstance.componentProperties[pk];
      if (prop && typeof prop === 'object' && 'value' in prop) {
        console.log(`   - ${pk}: value="${prop.value}"`);
      }
    }
    
    // ВАЖНО: Собираем ВСЕ свойства и устанавливаем ОДНИМ вызовом setProperties
    // чтобы избежать перестроения компонента между вызовами
    const propsToSet: Record<string, string> = {};
    
    // 1. Находим view property
    // ВАЖНО: Используем #EPrice_View если установлен (учитывает Fintech),
    // иначе определяем по наличию скидки
    const explicitView = row['#EPrice_View'];
    let viewVariants: string[];
    
    if (explicitView === 'special') {
      // С Fintech — зелёная цена
      viewVariants = ['special', 'Special'];
    } else if (explicitView === 'default' || !hasDiscount) {
      // Без Fintech или без скидки — обычная цена
      viewVariants = ['default', 'Default'];
    } else {
      // Fallback: есть скидка, но view не определён — default
      viewVariants = ['default', 'Default'];
    }
    
    console.log(`🔍 [EPrice] explicitView="${explicitView}", hasDiscount=${hasDiscount}, viewVariants=${viewVariants}`);
    
    let viewPropKey: string | null = null;
    for (const propKey in ePriceInstance.componentProperties) {
      if (propKey === 'view' || propKey.startsWith('view#')) {
        viewPropKey = propKey;
        break;
      }
    }
    
    // 2. Находим value property для цены
    let valuePropKey: string | null = null;
    const priceProps = ['value', 'text', 'content', 'price'];
    for (const propKey in ePriceInstance.componentProperties) {
      const propLower = propKey.toLowerCase();
      for (const pn of priceProps) {
        if (propLower === pn || propLower.startsWith(pn + '#')) {
          valuePropKey = propKey;
          break;
        }
      }
      if (valuePropKey) break;
    }
    
    // 3. Подготавливаем значение цены
    const numericPrice = priceValue ? priceValue.replace(/[^\d]/g, '') : '';
    
    console.log(`🔍 [EPrice] viewPropKey="${viewPropKey}", valuePropKey="${valuePropKey}", price="${numericPrice}"`);
    
    // 4. Пробуем установить ВСЕ свойства ОДНИМ вызовом
    // Пробуем разные варианты view
    let success = false;
    for (const viewValue of viewVariants) {
      try {
        // Собираем все свойства для одного вызова
        if (viewPropKey) {
          propsToSet[viewPropKey] = viewValue;
        }
        if (valuePropKey && numericPrice) {
          propsToSet[valuePropKey] = numericPrice;
        }
        
        if (Object.keys(propsToSet).length > 0) {
          ePriceInstance.setProperties(propsToSet);
          console.log(`✅ [EPrice] Установлены свойства одним вызовом:`, JSON.stringify(propsToSet));
          success = true;
          break;
        }
      } catch (e) {
        // Пробуем следующий вариант view
        console.log(`🔄 [EPrice] Не удалось с view="${viewValue}", пробуем следующий...`);
      }
    }
    
    // 5. Если нет valuePropKey, нужно установить цену через TEXT node внутри EPrice
    if (!valuePropKey && numericPrice) {
      console.log(`🔍 [EPrice] Нет exposed property для цены, ищем TEXT node внутри EPrice...`);
      
      // Пере-находим свежий EPrice после установки view
      let freshEPrice: InstanceNode | null = null;
      if ('children' in activeEPriceGroup) {
        const findFreshEPrice = (node: BaseNode): InstanceNode | null => {
          if (node.type === 'INSTANCE' && node.name === 'EPrice' && !node.removed) {
            let parent = node.parent;
            while (parent && parent.id !== activeEPriceGroup.id) {
              if (parent.name && (parent.name.includes('Old') || parent.name.includes('old'))) {
                return null;
              }
              parent = parent.parent;
            }
            return node as InstanceNode;
          }
          if ('children' in node && node.children) {
            for (const child of node.children) {
              const found = findFreshEPrice(child);
              if (found) return found;
            }
          }
          return null;
        };
        freshEPrice = findFreshEPrice(activeEPriceGroup);
      }
      
      if (freshEPrice) {
        // Ищем TEXT node с именем #OrganicPrice или содержащий цену
        const findPriceTextNode = (node: BaseNode): TextNode | null => {
          if (node.type === 'TEXT' && !node.removed) {
            const textNode = node as TextNode;
            // Приоритет: ищем слой с именем #OrganicPrice
            if (textNode.name === '#OrganicPrice' || 
                textNode.name.toLowerCase().includes('price') ||
                textNode.name.toLowerCase().includes('value')) {
              return textNode;
            }
          }
          if ('children' in node && node.children) {
            for (const child of node.children) {
              const found = findPriceTextNode(child);
              if (found) return found;
            }
          }
          return null;
        };
        
        // Сначала ищем по имени
        let textNode = findPriceTextNode(freshEPrice);
        
        // Если не нашли по имени, ищем TEXT с числовым содержимым (цена)
        if (!textNode) {
          const findNumericTextNode = (node: BaseNode): TextNode | null => {
            if (node.type === 'TEXT' && !node.removed) {
              const tn = node as TextNode;
              // Проверяем, содержит ли текст числа (похоже на цену)
              if (/\d/.test(tn.characters)) {
                return tn;
              }
            }
            if ('children' in node && node.children) {
              for (const child of node.children) {
                const found = findNumericTextNode(child);
                if (found) return found;
              }
            }
            return null;
          };
          textNode = findNumericTextNode(freshEPrice);
        }
        if (textNode) {
          // Форматируем цену с пробелами (81299 → 81 299)
          const formattedPrice = numericPrice.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
          console.log(`🔍 [EPrice] Найден TEXT node "${textNode.name}", устанавливаем: "${formattedPrice}"`);
          
          // Нужно загрузить шрифт перед изменением текста
          try {
            if (textNode.fontName !== figma.mixed) {
              await figma.loadFontAsync(textNode.fontName as FontName);
            }
            textNode.characters = formattedPrice;
            console.log(`✅ [EPrice] Цена установлена через TEXT node: "${formattedPrice}"`);
          } catch (e) {
            console.log(`⚠️ [EPrice] Ошибка установки текста: ${e}`);
          }
        } else {
          console.log(`⚠️ [EPrice] TEXT node не найден внутри EPrice`);
        }
      }
    }
    
    // 6. Если комбинированный вызов не сработал, пробуем по отдельности
    if (!success) {
      console.log(`⚠️ [EPrice] Комбинированный вызов не сработал, пробуем по отдельности`);
      
      // Сначала view
      if (viewPropKey) {
        for (const viewValue of viewVariants) {
          try {
            ePriceInstance.setProperties({ [viewPropKey]: viewValue });
            console.log(`✅ [EPrice] Установлен view=${viewValue}`);
            break;
          } catch {
            // Пробуем следующий
          }
        }
      }
      
      // Затем цена - ПОСЛЕ установки view нужно ПЕРЕ-НАЙТИ EPrice!
      if (valuePropKey && numericPrice) {
        // Пере-находим EPrice после изменения view (используем activeEPriceGroup)
        let freshEPrice: InstanceNode | null = null;
        if ('children' in activeEPriceGroup) {
          const findFreshEPrice = (node: BaseNode): InstanceNode | null => {
            if (node.type === 'INSTANCE' && node.name === 'EPrice' && !node.removed) {
              // Проверяем что это не старая цена
              let parent = node.parent;
              while (parent && parent.id !== activeEPriceGroup.id) {
                if (parent.name && (parent.name.includes('Old') || parent.name.includes('old'))) {
                  return null;
                }
                parent = parent.parent;
              }
              return node as InstanceNode;
            }
            if ('children' in node && node.children) {
              for (const child of node.children) {
                const found = findFreshEPrice(child);
                if (found) return found;
              }
            }
            return null;
          };
          freshEPrice = findFreshEPrice(activeEPriceGroup);
        }
        
        if (freshEPrice && freshEPrice.componentProperties) {
          // Ищем value property заново
          for (const propKey in freshEPrice.componentProperties) {
            const propLower = propKey.toLowerCase();
            for (const pn of priceProps) {
              if (propLower === pn || propLower.startsWith(pn + '#')) {
                try {
                  freshEPrice.setProperties({ [propKey]: numericPrice });
                  console.log(`✅ [EPrice] Установлена цена через ${propKey}="${numericPrice}" (после пере-поиска)`);
                } catch (e) {
                  console.log(`⚠️ [EPrice] Ошибка setProperties для ${propKey}: ${e}`);
                }
                break;
              }
            }
            break;
          }
        }
      }
    }
  } else {
    console.log(`⚠️ [EPrice] EPrice не найден или не имеет componentProperties`);
  }
  
  // Fintech - включаем/выключаем блок рассрочки
  // ВАЖНО: используем activeEPriceGroup (свежую ссылку после изменения вариантов)
  const hasFintech = row['#EPriceGroup_Fintech'] === 'true';
  processVariantProperty(activeEPriceGroup, `Fintech=${hasFintech}`, '#EPriceGroup_Fintech');
  
  // После изменения Fintech variant нужно пере-найти EPriceGroup
  const freshEPriceGroupAfterFintech = findInstanceByName(container, 'EPriceGroup');
  const ePriceGroupForFintech = freshEPriceGroupAfterFintech || activeEPriceGroup;
  console.log(`🔄 [EPriceGroup] После Fintech: ${freshEPriceGroupAfterFintech ? 'найден свежий' : 'используем старый'}`);
  
  if (hasFintech) {
    // Находим инстанс Fintech — сначала внутри СВЕЖЕГО EPriceGroup, потом в контейнере
    let fintechInstance = findInstanceByName(ePriceGroupForFintech, 'Fintech') ||
                          findInstanceByName(ePriceGroupForFintech, 'MetaFintech') ||
                          findInstanceByName(ePriceGroupForFintech, 'Meta / Fintech') ||
                          findInstanceByName(ePriceGroupForFintech, 'Meta / Fintech '); // с пробелом
    
    // Если не нашли внутри EPriceGroup, ищем в контейнере
    if (!fintechInstance) {
      fintechInstance = findInstanceByName(container, 'Fintech') ||
                        findInstanceByName(container, 'MetaFintech') ||
                        findInstanceByName(container, 'Meta / Fintech') ||
                        findInstanceByName(container, 'Meta / Fintech '); // с пробелом в конце
    }
    
    if (fintechInstance) {
      Logger.debug(`      💳 Найден Fintech инстанс: "${fintechInstance.name}"`);
    
      // Устанавливаем type (Split/Pay) — это Variant Property
      const fintechType = row['#Fintech_Type'];
      Logger.debug(`      💳 Fintech_Type из данных: "${fintechType || 'не задан'}"`);
      
      if (fintechType) {
        // Пробуем разные варианты названия свойства: type, Type
        Logger.debug(`      💳 Пробуем установить type=${fintechType}...`);
        let typeSet = processVariantProperty(fintechInstance, `type=${fintechType}`, '#Fintech_Type');
        Logger.debug(`      💳 type=${fintechType} результат: ${typeSet}`);
        
        if (!typeSet) {
          Logger.debug(`      💳 Пробуем Type=${fintechType}...`);
          typeSet = processVariantProperty(fintechInstance, `Type=${fintechType}`, '#Fintech_Type');
          Logger.debug(`      💳 Type=${fintechType} результат: ${typeSet}`);
        }
        if (!typeSet) {
          // Fallback на String Property
          Logger.debug(`      💳 Fallback на String Property...`);
          processStringProperty(fintechInstance, 'type', fintechType, '#Fintech_Type');
        }
      }
      
      // Устанавливаем View (Extra Short/Short) — Variant Property с большой буквы!
      const fintechView = row['#Fintech_View'];
      if (fintechView) {
        // В Figma свойство называется "View" с большой буквы
        Logger.debug(`      💳 Пробуем установить View=${fintechView}...`);
        let viewSet = processVariantProperty(fintechInstance, `View=${fintechView}`, '#Fintech_View');
        Logger.debug(`      💳 View=${fintechView} результат: ${viewSet}`);
        
        if (!viewSet) {
          // Fallback на view с маленькой буквы
          viewSet = processVariantProperty(fintechInstance, `view=${fintechView}`, '#Fintech_View');
        }
        if (!viewSet) {
          // Fallback на String Property
          processStringProperty(fintechInstance, 'View', fintechView, '#Fintech_View');
        }
      }
    } else {
      Logger.warn(`      ⚠️ Fintech instance not found inside EPriceGroup`);
    }
  }
}

// Обработка EPrice view (special, default и др.)
export function handleEPriceView(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;

  const priceView = row['#EPrice_View'];
  if (!priceView) return;
  
  // Находим EPriceGroup сначала, потом EPrice внутри него
  const ePriceGroupInstance = findInstanceByName(container, 'EPriceGroup');
  let ePriceInstance: InstanceNode | null = null;
  
  // Ищем EPrice внутри EPriceGroup (приоритет)
  if (ePriceGroupInstance) {
    ePriceInstance = findInstanceByName(ePriceGroupInstance, 'EPrice');
  }
  
  // Fallback: ищем EPrice напрямую в контейнере
  if (!ePriceInstance) {
    ePriceInstance = findInstanceByName(container, 'EPrice');
  }
  
  if (ePriceInstance) {
    console.log(`🔍 [EPrice View] Найден EPrice, устанавливаем view=${priceView}`);
    
    // Пробуем как Variant Property
    let viewSet = processVariantProperty(ePriceInstance, `view=${priceView}`, '#EPrice_View');
    
    // Fallback: пробуем с большой буквы
    if (!viewSet) {
      viewSet = processVariantProperty(ePriceInstance, `View=${priceView}`, '#EPrice_View');
    }
    
    // Fallback: пробуем как String Property
    if (!viewSet) {
      processStringProperty(ePriceInstance, 'view', priceView, '#EPrice_View');
    }
    
    Logger.debug(`   💰 [EPrice] view=${priceView}, результат: ${viewSet}`);
  } else {
    console.log(`⚠️ [EPrice View] EPrice не найден в контейнере "${container.name}"`);
  }
}

// Обработка LabelDiscount view и prefix
// ВАЖНО: async функция для корректной загрузки шрифтов
export async function handleLabelDiscountView(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const labelView = row['#LabelDiscount_View'];
  const discountPrefix = row['#DiscountPrefix'];
  const discountValue = row['#discount'] || row['#DiscountPercent'];
  
  // Находим EPriceGroup сначала, затем LabelDiscount внутри него
  const ePriceGroupInstance = findInstanceByName(container, 'EPriceGroup');
  
  // Вспомогательная функция для поиска LabelDiscount
  // ВАЖНО: НЕ используем fallback на 'Label' — слишком широкий, может найти EPriceBarometer-Label
  const findLabelDiscount = (searchIn: BaseNode | null): InstanceNode | null => {
    if (!searchIn) return null;
    return findInstanceByName(searchIn, 'LabelDiscount') ||
           findInstanceByName(searchIn, 'Discount') ||
           findInstanceByName(searchIn, 'Label / Discount'); // специфичное имя
  };
  
  // Пробуем найти LabelDiscount в EPriceGroup или контейнере
  let labelDiscountInstance = findLabelDiscount(ePriceGroupInstance) || findLabelDiscount(container);
  
  if (!labelDiscountInstance) {
    if (labelView || discountPrefix) {
      Logger.warn(`   ⚠️ [LabelDiscount] Инстанс не найден в контейнере "${container.name}"`);
    }
    return;
  }
  
  Logger.debug(`   🏷️ [LabelDiscount] Найден инстанс: "${labelDiscountInstance.name}"`);
  
  // 1. Устанавливаем View variant (если есть)
  if (labelView) {
    Logger.debug(`   🏷️ [LabelDiscount] Пробуем View=${labelView}...`);
    let viewSet = processVariantProperty(labelDiscountInstance, `View=${labelView}`, '#LabelDiscount_View');
    
    if (!viewSet) {
      viewSet = processVariantProperty(labelDiscountInstance, `view=${labelView}`, '#LabelDiscount_View');
    }
    if (!viewSet) {
      processStringProperty(labelDiscountInstance, 'View', labelView, '#LabelDiscount_View');
    }
    Logger.debug(`   🏷️ [LabelDiscount] View=${labelView} результат: ${viewSet}`);
    
    // КРИТИЧНО: После setProperties структура компонента могла измениться!
    // Пере-находим LabelDiscount после изменения View variant
    const freshLabelDiscount = findLabelDiscount(ePriceGroupInstance) || findLabelDiscount(container);
    if (freshLabelDiscount) {
      labelDiscountInstance = freshLabelDiscount;
      console.log(`🔄 [LabelDiscount] Пере-поиск после View: найден свежий`);
    }
  }
  
  // 2. Устанавливаем текст скидки
  // ВАЖНО: discountValue уже содержит "Вам –X%" если есть prefix (сформировано в snippet-parser.ts)
  if (discountValue) {
    const discountText = discountValue;
    Logger.debug(`   🏷️ [LabelDiscount] Устанавливаем текст скидки: "${discountText}"`);
    
    // Ищем TEXT node внутри СВЕЖЕГО LabelDiscount
    const findDiscountTextNode = (node: BaseNode): TextNode | null => {
      if (node.type === 'TEXT' && !node.removed) {
        const textNode = node as TextNode;
        if (textNode.name.toLowerCase().includes('content') ||
            textNode.name.toLowerCase().includes('discount') ||
            textNode.name.toLowerCase().includes('value') ||
            /\d/.test(textNode.characters)) {
          return textNode;
        }
      }
      if ('children' in node && node.children) {
        for (const child of node.children) {
          const found = findDiscountTextNode(child);
          if (found) return found;
        }
      }
      return null;
    };
    
    const textNode = findDiscountTextNode(labelDiscountInstance);
    if (textNode) {
      try {
        if (textNode.fontName !== figma.mixed) {
          // ВАЖНО: await вместо .then() для гарантии выполнения
          await figma.loadFontAsync(textNode.fontName as FontName);
          textNode.characters = discountText;
          console.log(`✅ [LabelDiscount] Текст установлен: "${discountText}"`);
        } else {
          console.log(`⚠️ [LabelDiscount] Mixed fonts, пропускаем установку текста`);
        }
      } catch (e) {
        console.log(`⚠️ [LabelDiscount] Ошибка установки текста: ${e}`);
      }
    } else {
      Logger.debug(`   ⚠️ [LabelDiscount] TEXT node не найден внутри LabelDiscount`);
    }
  }
}

// Обработка ELabelGroup
export async function handleELabelGroup(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const config = COMPONENT_CONFIG.ELabelGroup;
  const eLabelGroupInstance = findInstanceByName(container, config.name);
  
  // Rating (#ProductRating)
  const ratingVal = row[config.properties.rating.dataField];
  const hasRating = ratingVal && ratingVal.trim() !== '';
  
  if (hasRating) {
    // 1. Обновляем текст
    const ratingTextLayer = findTextLayerByName(container, config.properties.rating.dataField);
    if (ratingTextLayer) {
      try {
        const fontName = ratingTextLayer.fontName;
        if (fontName && typeof fontName === 'object' && fontName.family && fontName.style) {
          await figma.loadFontAsync({ family: fontName.family, style: fontName.style });
        }
        ratingTextLayer.characters = ratingVal;
      } catch (e) {
        Logger.error(`      ❌ Ошибка применения значения к ${config.properties.rating.dataField}:`, e);
      }
    }
    
    // 2. Включаем Rating=true в инстансе
    if (eLabelGroupInstance) {
      processVariantProperty(eLabelGroupInstance, `${config.properties.rating.variantName}=true`, config.properties.rating.dataField);
    }
  } else {
    // Выключаем Rating=false
    if (eLabelGroupInstance) {
      processVariantProperty(eLabelGroupInstance, `${config.properties.rating.variantName}=false`, config.properties.rating.dataField);
    }
  }
  
  // Barometer
  if (eLabelGroupInstance) {
    const barometerVal = row[config.properties.barometer.dataField];
    const hasBarometer = barometerVal === 'true';
    processVariantProperty(
      eLabelGroupInstance, 
      `${config.properties.barometer.variantName}=${hasBarometer}`, 
      config.properties.barometer.dataField
    );
  }
}

// Обработка EPriceBarometer
export function handleEPriceBarometer(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;

  const config = COMPONENT_CONFIG.EPriceBarometer;
  const barometerVal = row['#ELabelGroup_Barometer']; // Зависимость от поля ELabelGroup
  const hasBarometer = barometerVal === 'true';
  const viewVal = row[config.properties.view.dataField];
  const isCompactVal = row[config.properties.isCompact.dataField];
  
  if (hasBarometer && viewVal) {
    const ePriceBarometerInstance = findInstanceByName(container, config.name);
    if (ePriceBarometerInstance) {
      // Устанавливаем View (below-market, in-market, above-market)
      processStringProperty(
        ePriceBarometerInstance,
        config.properties.view.variantName,
        viewVal,
        config.properties.view.dataField
      );
      
      // Устанавливаем isCompact (true для EShopItem, false для остальных)
      if (isCompactVal) {
        const isCompact = isCompactVal === 'true';
        processVariantProperty(
          ePriceBarometerInstance,
          `${config.properties.isCompact.variantName}=${isCompact}`,
          config.properties.isCompact.dataField
        );
        Logger.debug(`   📐 [EPriceBarometer] isCompact=${isCompact}`);
      }
    }
  }
}

// Обработка EMarketCheckoutLabel - показать/скрыть в зависимости от наличия в HTML
export function handleEMarketCheckoutLabel(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;

  const hasLabel = row['#EMarketCheckoutLabel'] === 'true';
  const labelInstance = findInstanceByName(container, 'EMarketCheckoutLabel');
  
  if (labelInstance) {
    try {
      labelInstance.visible = hasLabel;
      Logger.debug(`   🏷️ [EMarketCheckoutLabel] visible=${hasLabel} для контейнера "${container.name}"`);
    } catch (e) {
      Logger.error(`   ❌ Ошибка установки visible для EMarketCheckoutLabel:`, e);
    }
  }
}

// Поиск группы по имени внутри узла
function findGroupByName(node: BaseNode, name: string): GroupNode | FrameNode | null {
  if ((node.type === 'GROUP' || node.type === 'FRAME') && node.name === name && !node.removed) {
    return node as GroupNode | FrameNode;
  }
  
  if ('children' in node && node.children) {
    for (const child of node.children) {
      const found = findGroupByName(child, name);
      if (found) return found;
    }
  }
  
  return null;
}

// Поиск всех узлов по имени внутри узла
function findAllNodesByName(node: BaseNode, name: string): SceneNode[] {
  const results: SceneNode[] = [];
  
  if ('name' in node && node.name === name && !node.removed) {
    results.push(node as SceneNode);
  }
  
  if ('children' in node && node.children) {
    for (const child of node.children) {
      results.push(...findAllNodesByName(child, name));
    }
  }
  
  return results;
}

// Обработка EDeliveryGroup - показать/скрыть и заполнить items
export async function handleEDeliveryGroup(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const hasDelivery = row['#EDeliveryGroup'] === 'true';
  const deliveryGroupInstance = findInstanceByName(container, 'EDeliveryGroup');
  
  if (!deliveryGroupInstance) return;
  
  if (!hasDelivery) {
    // Скрываем весь блок доставки
    try {
      deliveryGroupInstance.visible = false;
      Logger.debug(`   📦 [EDeliveryGroup] visible=false для контейнера "${container.name}"`);
    } catch (e) {
      Logger.error(`   ❌ Ошибка скрытия EDeliveryGroup:`, e);
    }
    return;
  }
  
  // Показываем блок
  try {
    deliveryGroupInstance.visible = true;
  } catch (e) {
    // ignore
  }
  
  // Находим все текстовые слои #EDeliveryGroup-Item внутри
  const itemLayers = findAllNodesByName(deliveryGroupInstance, '#EDeliveryGroup-Item');
  const itemCount = parseInt(row['#EDeliveryGroup-Count'] || '0', 10);
  
  Logger.debug(`   📦 [EDeliveryGroup] Найдено ${itemLayers.length} слоёв #EDeliveryGroup-Item, данных: ${itemCount}`);
  
  // Заполняем текстовые слои и скрываем неиспользуемые
  for (let i = 0; i < itemLayers.length; i++) {
    const layer = itemLayers[i];
    const dataIndex = i + 1;
    const itemValue = row[`#EDeliveryGroup-Item-${dataIndex}`];
    
    if (itemValue && dataIndex <= itemCount) {
      // Заполняем текстом и показываем
      try {
        if (layer.type === 'TEXT') {
          const textNode = layer as TextNode;
          const fontName = textNode.fontName;
          if (fontName && typeof fontName === 'object' && fontName.family && fontName.style) {
            await figma.loadFontAsync({ family: fontName.family, style: fontName.style });
          }
          textNode.characters = itemValue;
          textNode.visible = true;
          Logger.debug(`      ✅ Item ${dataIndex}: "${itemValue}"`);
        } else {
          layer.visible = true;
        }
      } catch (e) {
        Logger.error(`      ❌ Ошибка заполнения Item ${dataIndex}:`, e);
      }
    } else {
      // Скрываем неиспользуемый слой
      try {
        layer.visible = false;
        Logger.debug(`      ❌ Item ${dataIndex}: скрыт (нет данных)`);
      } catch (e) {
        // ignore
      }
    }
  }
}

// Обработка OfficialShop - показать/скрыть группу "After" внутри EShopName
export function handleOfficialShop(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;

  const isOfficial = row['#OfficialShop'] === 'true';
  
  // Ищем инстанс EShopName
  const shopNameInstance = findInstanceByName(container, 'EShopName');
  
  if (shopNameInstance) {
    // Ищем группу "After" внутри EShopName
    const afterGroup = findGroupByName(shopNameInstance, 'After');
    
    if (afterGroup) {
      try {
        afterGroup.visible = isOfficial;
        Logger.debug(`   🏪 [OfficialShop] After.visible=${isOfficial} для магазина "${row['#ShopName']}"`);
      } catch (e) {
        Logger.error(`   ❌ Ошибка установки visible для After в EShopName:`, e);
      }
    } else {
      // Возможно "After" это не группа, а фрейм или другой тип — пробуем найти любой узел с этим именем
      if ('children' in shopNameInstance) {
        for (const child of shopNameInstance.children) {
          if (child.name === 'After' && !child.removed) {
            try {
              child.visible = isOfficial;
              Logger.debug(`   🏪 [OfficialShop] After.visible=${isOfficial} (${child.type}) для магазина "${row['#ShopName']}"`);
            } catch (e) {
              Logger.error(`   ❌ Ошибка установки visible для After:`, e);
            }
            break;
          }
        }
      }
    }
  }
}

// Обработка EOfferItem - карточка предложения магазина в попапе "Цены в магазинах"
// Устанавливает модификаторы: defaultOffer, hasButton, hasReviews, hasDelivery
export function handleEOfferItem(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;
  
  // Проверяем, что это EOfferItem
  const snippetType = row['#SnippetType'];
  if (snippetType !== 'EOfferItem') return;
  
  Logger.debug(`   📦 [EOfferItem] Обработка модификаторов для "${row['#ShopName']}"`);
  
  // Устанавливаем модификаторы как Variant Properties
  if (container.type === 'INSTANCE' && !container.removed) {
    const instance = container as InstanceNode;
    
    // defaultOffer — основное предложение (первое в списке)
    const isDefaultOffer = row['#EOfferItem_defaultOffer'] === 'true';
    processVariantProperty(instance, `defaultOffer=${isDefaultOffer}`, '#EOfferItem_defaultOffer');
    
    // hasButton — с кнопкой "Купить"/"В магазин"
    const hasButton = row['#EOfferItem_hasButton'] === 'true' || row['#BUTTON'] === 'true';
    let buttonSet = processVariantProperty(instance, `button=${hasButton}`, '#EOfferItem_hasButton');
    if (!buttonSet) buttonSet = processVariantProperty(instance, `Button=${hasButton}`, '#EOfferItem_hasButton');
    if (!buttonSet) buttonSet = processVariantProperty(instance, `hasButton=${hasButton}`, '#EOfferItem_hasButton');
    
    // hasReviews — с отзывами
    const hasReviews = row['#EOfferItem_hasReviews'] === 'true' || (row['#ReviewsNumber'] && row['#ReviewsNumber'].trim() !== '');
    let reviewsSet = processVariantProperty(instance, `reviews=${hasReviews}`, '#EOfferItem_hasReviews');
    if (!reviewsSet) reviewsSet = processVariantProperty(instance, `Reviews=${hasReviews}`, '#EOfferItem_hasReviews');
    if (!reviewsSet) reviewsSet = processVariantProperty(instance, `hasReviews=${hasReviews}`, '#EOfferItem_hasReviews');
    
    // hasDelivery — с доставкой
    const hasDelivery = row['#EOfferItem_hasDelivery'] === 'true' || (row['#DeliveryList'] && row['#DeliveryList'].trim() !== '');
    let deliverySet = processVariantProperty(instance, `delivery=${hasDelivery}`, '#EOfferItem_hasDelivery');
    if (!deliverySet) deliverySet = processVariantProperty(instance, `Delivery=${hasDelivery}`, '#EOfferItem_hasDelivery');
    if (!deliverySet) deliverySet = processVariantProperty(instance, `hasDelivery=${hasDelivery}`, '#EOfferItem_hasDelivery');
    
    Logger.debug(`   📦 [EOfferItem] Модификаторы: defaultOffer=${isDefaultOffer}, button=${hasButton}, reviews=${hasReviews}, delivery=${hasDelivery}`);
  }
}

// Обработка BUTTON - кнопка "Купить в 1 клик" (MarketCheckout)
// Устанавливает Variant Property BUTTON=true/false на контейнере сниппета
export function handleMarketCheckoutButton(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;

  const hasButton = row['#BUTTON'] === 'true';
  
  // Устанавливаем BUTTON variant property на контейнере
  if (container.type === 'INSTANCE' && !container.removed) {
    const instance = container as InstanceNode;
    
    // Пробуем разные варианты названия свойства
    let buttonSet = processVariantProperty(instance, `BUTTON=${hasButton}`, '#BUTTON');
    if (!buttonSet) buttonSet = processVariantProperty(instance, `Button=${hasButton}`, '#BUTTON');
    if (!buttonSet) buttonSet = processVariantProperty(instance, `button=${hasButton}`, '#BUTTON');
    
    if (buttonSet) {
      Logger.debug(`   🛒 [BUTTON] BUTTON=${hasButton} для контейнера "${container.name}"`);
    }
  }
  
  // Также ищем вложенные инстансы с BUTTON property
  if ('children' in container) {
    for (const child of container.children) {
      if (child.type === 'INSTANCE' && !child.removed) {
        const childInstance = child as InstanceNode;
        
        // Проверяем, есть ли у этого инстанса свойство BUTTON
        const props = childInstance.componentProperties;
        for (const propKey in props) {
          if (propKey.toLowerCase().includes('button')) {
            try {
              const propName = propKey.split('#')[0]; // Убираем хеш из имени
              processVariantProperty(childInstance, `${propName}=${hasButton}`, '#BUTTON');
              Logger.debug(`   🛒 [BUTTON] ${propName}=${hasButton} для инстанса "${childInstance.name}"`);
            } catch (e) {
              // ignore
            }
          }
        }
      }
    }
  }
}

// Обработка EButton - кнопка внутри сниппета (view и visible)
// 
// Логика по типам сниппетов:
// - EOfferItem: красная кнопка → view='primaryShort', белая → view='white'
// - EShopItem: красная кнопка → view='primaryShort', дефолтная → view='secondary'
// - ESnippet/Organic: кнопка есть → view='primaryShort' + visible=true, нет → visible=false
export function handleEButton(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;
  
  const snippetType = row['#SnippetType'];
  const hasButton = row['#BUTTON'] === 'true';
  const buttonView = row['#ButtonView']; // primaryShort, white, secondary
  const eButtonVisible = row['#EButton_visible'];
  
  // Находим EButton внутри контейнера
  const eButtonInstance = findInstanceByName(container, 'EButton');
  
  if (!eButtonInstance) {
    // Если EButton не найден, пробуем альтернативные имена
    const altNames = ['Button', 'MarketButton', 'CheckoutButton'];
    let foundButton: InstanceNode | null = null;
    for (const name of altNames) {
      foundButton = findInstanceByName(container, name);
      if (foundButton) break;
    }
    
    if (!foundButton) {
      // Логируем только для сниппетов где ожидается кнопка
      if (hasButton && (snippetType === 'Organic_withOfferInfo' || snippetType === 'Organic')) {
        Logger.debug(`   ⚠️ [EButton] EButton не найден в контейнере "${container.name}"`);
      }
      return;
    }
    
    // Используем найденную альтернативу
    handleButtonInstance(foundButton, snippetType, hasButton, buttonView, eButtonVisible);
    return;
  }
  
  handleButtonInstance(eButtonInstance, snippetType, hasButton, buttonView, eButtonVisible);
}

// Вспомогательная функция для обработки найденного инстанса кнопки
function handleButtonInstance(
  buttonInstance: InstanceNode, 
  snippetType: string, 
  hasButton: boolean, 
  buttonView: string | undefined,
  eButtonVisible: string | undefined
): void {
  Logger.debug(`   🔘 [EButton] Найден инстанс "${buttonInstance.name}" в ${snippetType}`);
  
  // === Логика для ESnippet/Organic ===
  if (snippetType === 'Organic_withOfferInfo' || snippetType === 'Organic') {
    // Управляем видимостью кнопки
    const shouldBeVisible = eButtonVisible === 'true' || hasButton;
    
    try {
      buttonInstance.visible = shouldBeVisible;
      Logger.debug(`   🔘 [EButton] visible=${shouldBeVisible} для ESnippet`);
    } catch (e) {
      Logger.error(`   ❌ [EButton] Ошибка установки visible:`, e);
    }
    
    // Если кнопка видима, устанавливаем view
    if (shouldBeVisible && buttonView) {
      setButtonView(buttonInstance, buttonView);
    }
    return;
  }
  
  // === Логика для EOfferItem и EShopItem ===
  // Кнопка ВСЕГДА видна для этих типов сниппетов
  if (snippetType === 'EOfferItem' || snippetType === 'EShopItem') {
    // Показываем кнопку
    try {
      buttonInstance.visible = true;
      Logger.debug(`   🔘 [EButton] visible=true для ${snippetType}`);
    } catch (e) {
      Logger.error(`   ❌ [EButton] Ошибка установки visible:`, e);
    }
    
    // Устанавливаем view
    if (buttonView) {
      setButtonView(buttonInstance, buttonView);
    }
    return;
  }
  
  // === Логика для EProductSnippet2 ===
  if (snippetType === 'EProductSnippet2') {
    if (hasButton && buttonView) {
      setButtonView(buttonInstance, buttonView);
    }
  }
}

// Устанавливает view property для кнопки
function setButtonView(buttonInstance: InstanceNode, viewValue: string): void {
  // Пробуем разные варианты названия свойства view
  const viewVariants = [
    `view=${viewValue}`,
    `View=${viewValue}`,
    `VIEW=${viewValue}`
  ];
  
  let viewSet = false;
  for (const variant of viewVariants) {
    viewSet = processVariantProperty(buttonInstance, variant, '#ButtonView');
    if (viewSet) {
      Logger.debug(`   🔘 [EButton] Установлен ${variant}`);
      break;
    }
  }
  
  // Fallback: пробуем как String Property
  if (!viewSet) {
    processStringProperty(buttonInstance, 'view', viewValue, '#ButtonView');
    Logger.debug(`   🔘 [EButton] Установлен view="${viewValue}" (String Property)`);
  }
}

