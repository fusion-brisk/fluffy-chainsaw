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
export function handleEPriceGroup(context: HandlerContext): void {
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
  
  // Устанавливаем значение текущей цены в EPrice через exposed property
  const priceValue = row['#OrganicPrice'];
  const ePriceInstance = findInstanceByName(ePriceGroupInstance, 'EPrice');
  
  if (ePriceInstance && ePriceInstance.componentProperties) {
    // 1. Устанавливаем view = default/discount в зависимости от наличия скидки
    // Это сбрасывает цвет цены при работе "поверх" старых данных
    const viewValue = hasDiscount ? 'discount' : 'default';
    for (const propKey in ePriceInstance.componentProperties) {
      if (propKey === 'view' || propKey.startsWith('view#')) {
        try {
          ePriceInstance.setProperties({ [propKey]: viewValue });
          console.log(`✅ [EPrice] Установлен view=${viewValue}`);
        } catch (e) {
          // Пробуем альтернативные значения
          try {
            const altValue = hasDiscount ? 'Discount' : 'Default';
            ePriceInstance.setProperties({ [propKey]: altValue });
            console.log(`✅ [EPrice] Установлен view=${altValue} (альтернатива)`);
          } catch {
            console.log(`⚠️ [EPrice] Не удалось установить view: ${e}`);
          }
        }
        break;
      }
    }
    
    // 2. Устанавливаем значение цены
    if (priceValue) {
      for (const propKey in ePriceInstance.componentProperties) {
        if (propKey === 'value' || propKey.startsWith('value#')) {
          const numericPrice = priceValue.replace(/[^\d]/g, '');
          if (numericPrice) {
            try {
              ePriceInstance.setProperties({ [propKey]: numericPrice });
              console.log(`✅ [EPrice] Установлена цена ${propKey}="${numericPrice}"`);
            } catch (e) {
              console.log(`⚠️ [EPrice] Ошибка setProperties для ${propKey}: ${e}`);
            }
          }
          break;
        }
      }
    }
  }
  
  // Fintech - включаем/выключаем блок рассрочки
  const hasFintech = row['#EPriceGroup_Fintech'] === 'true';
  processVariantProperty(ePriceGroupInstance, `Fintech=${hasFintech}`, '#EPriceGroup_Fintech');
  
  if (hasFintech) {
    // Находим инстанс Fintech — сначала внутри EPriceGroup, потом в контейнере
    let fintechInstance = findInstanceByName(ePriceGroupInstance, 'Fintech') ||
                          findInstanceByName(ePriceGroupInstance, 'MetaFintech') ||
                          findInstanceByName(ePriceGroupInstance, 'Meta / Fintech') ||
                          findInstanceByName(ePriceGroupInstance, 'Meta / Fintech '); // с пробелом
    
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

// Обработка EPrice view (special и др.)
export function handleEPriceView(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;

  const priceView = row['#EPrice_View'];
  if (!priceView) return;
  
  // Находим инстанс EPrice внутри контейнера
  const ePriceInstance = findInstanceByName(container, 'EPrice');
  if (ePriceInstance) {
    processStringProperty(ePriceInstance, 'view', priceView, '#EPrice_View');
    Logger.debug(`   💰 [EPrice] view=${priceView}`);
  }
}

// Обработка LabelDiscount view и prefix
export function handleLabelDiscountView(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;

  const labelView = row['#LabelDiscount_View'];
  const discountPrefix = row['#DiscountPrefix'];
  const discountValue = row['#discount'] || row['#DiscountPercent'];
  
  // Находим EPriceGroup сначала, затем LabelDiscount внутри него
  const ePriceGroupInstance = findInstanceByName(container, 'EPriceGroup');
  
  // Пробуем найти LabelDiscount в разных местах с разными именами
  let labelDiscountInstance: InstanceNode | null = null;
  
  if (ePriceGroupInstance) {
    // Ищем внутри EPriceGroup
    labelDiscountInstance = findInstanceByName(ePriceGroupInstance, 'LabelDiscount') ||
                            findInstanceByName(ePriceGroupInstance, 'Label') ||
                            findInstanceByName(ePriceGroupInstance, 'Discount');
  }
  
  // Fallback: ищем напрямую в контейнере
  if (!labelDiscountInstance) {
    labelDiscountInstance = findInstanceByName(container, 'LabelDiscount') ||
                            findInstanceByName(container, 'Label') ||
                            findInstanceByName(container, 'Discount');
  }
  
  if (labelDiscountInstance) {
    Logger.debug(`   🏷️ [LabelDiscount] Найден инстанс: "${labelDiscountInstance.name}"`);
    
    if (labelView) {
      // В Figma свойство называется "View" с большой буквы
      Logger.debug(`   🏷️ [LabelDiscount] Пробуем View=${labelView}...`);
      let viewSet = processVariantProperty(labelDiscountInstance, `View=${labelView}`, '#LabelDiscount_View');
      
      if (!viewSet) {
        // Fallback на view с маленькой буквы
        viewSet = processVariantProperty(labelDiscountInstance, `view=${labelView}`, '#LabelDiscount_View');
      }
      if (!viewSet) {
        // Fallback на String Property
        processStringProperty(labelDiscountInstance, 'View', labelView, '#LabelDiscount_View');
      }
      Logger.debug(`   🏷️ [LabelDiscount] View=${labelView} результат: ${viewSet}`);
    }
    
    // Текст скидки уже сформирован в snippet-parser.ts как "Вам –X%"
    // Здесь НЕ нужно добавлять "Вам" повторно — processTextLayers применит row['#discount']
    if (discountPrefix) {
      Logger.debug(`   🏷️ [LabelDiscount] Скидка с префиксом "${discountPrefix}" будет применена через processTextLayers`);
    }
  } else if (labelView || discountPrefix) {
    Logger.warn(`   ⚠️ [LabelDiscount] Инстанс не найден в контейнере "${container.name}"`);
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
  
  if (hasBarometer && viewVal) {
    const ePriceBarometerInstance = findInstanceByName(container, config.name);
    if (ePriceBarometerInstance) {
      // Используем processStringProperty для свойства View, так как это может быть Variant Property или String
      processStringProperty(
        ePriceBarometerInstance,
        config.properties.view.variantName,
        viewVal,
        config.properties.view.dataField
      );
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

