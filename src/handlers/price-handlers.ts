/**
 * Обработчики цен и скидок
 * - handleEPriceGroup — EPriceGroup (Discount, OldPrice, Fintech, EPrice)
 * - handleEPriceView — EPrice view (special, default)
 * - handleLabelDiscountView — LabelDiscount view и текст
 */

import { COMPONENT_CONFIG } from '../config';
import { Logger } from '../logger';
import { processVariantProperty, processStringProperty } from '../property-utils';
import { findInstanceByName } from '../utils/node-search';
import { HandlerContext } from './types';

/**
 * Обработка EPriceGroup — основной обработчик цен
 */
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
  
  // Debug: выводим все свойства EPriceGroup
  Logger.debug(`🔍 [DEBUG EPriceGroup] Свойства инстанса "${ePriceGroupInstance.name}":`);
  const allProps = ePriceGroupInstance.componentProperties;
  for (const propKey in allProps) {
    if (Object.prototype.hasOwnProperty.call(allProps, propKey)) {
      const prop = allProps[propKey];
      if (prop && typeof prop === 'object') {
        const options = 'options' in prop ? (prop.options as string[]) : null;
        const value = 'value' in prop ? prop.value : 'N/A';
        const propType = 'type' in prop ? (prop as Record<string, unknown>).type : 'unknown';
        Logger.debug(`   - "${propKey}": type=${propType}, value="${value}", options=${options ? `[${options.join(', ')}]` : 'нет'}`);
      }
    }
  }
  
  Logger.debug(`      💰 [EPriceGroup] Discount data: "${discountVal}", hasDiscount: ${hasDiscount}`);
  
  let discountSet = false;
  if (hasDiscount) {
    discountSet = processVariantProperty(ePriceGroupInstance, 'Discount=true', config.properties.discount.dataField);
    if (!discountSet) discountSet = processVariantProperty(ePriceGroupInstance, 'Discount=True', config.properties.discount.dataField);
    if (!discountSet) discountSet = processVariantProperty(ePriceGroupInstance, 'discount=true', config.properties.discount.dataField);
  } else {
    discountSet = processVariantProperty(ePriceGroupInstance, 'Discount=false', config.properties.discount.dataField);
    if (!discountSet) discountSet = processVariantProperty(ePriceGroupInstance, 'Discount=False', config.properties.discount.dataField);
    if (!discountSet) discountSet = processVariantProperty(ePriceGroupInstance, 'discount=false', config.properties.discount.dataField);
  }
  Logger.debug(`💰 [EPriceGroup] Discount=${hasDiscount}, результат: ${discountSet}`);
  
  // Old Price
  const oldPriceVal = row[config.properties.oldPrice.dataField];
  const hasOldPrice = oldPriceVal === 'true';
  Logger.debug(`      💰 [EPriceGroup] OldPrice data: "${oldPriceVal}", hasOldPrice: ${hasOldPrice}`);
  
  let oldPriceSet = false;
  if (hasOldPrice) {
    oldPriceSet = processVariantProperty(ePriceGroupInstance, 'Old Price=true', config.properties.oldPrice.dataField);
    if (!oldPriceSet) oldPriceSet = processVariantProperty(ePriceGroupInstance, 'OldPrice=true', config.properties.oldPrice.dataField);
    if (!oldPriceSet) oldPriceSet = processVariantProperty(ePriceGroupInstance, 'Old_Price=true', config.properties.oldPrice.dataField);
  } else {
    oldPriceSet = processVariantProperty(ePriceGroupInstance, 'Old Price=false', config.properties.oldPrice.dataField);
    if (!oldPriceSet) oldPriceSet = processVariantProperty(ePriceGroupInstance, 'OldPrice=false', config.properties.oldPrice.dataField);
    if (!oldPriceSet) oldPriceSet = processVariantProperty(ePriceGroupInstance, 'Old_Price=false', config.properties.oldPrice.dataField);
    if (!oldPriceSet) oldPriceSet = processVariantProperty(ePriceGroupInstance, 'old price=false', config.properties.oldPrice.dataField);
    if (!oldPriceSet) oldPriceSet = processVariantProperty(ePriceGroupInstance, 'oldprice=false', config.properties.oldPrice.dataField);
  }
  Logger.debug(`      💰 [EPriceGroup] Old Price=${hasOldPrice} результат: ${oldPriceSet}`);
  
  // DISCOUNT + OLD PRICE
  const hasDiscountOrOldPrice = hasDiscount || hasOldPrice;
  let discountOldPriceSet = processVariantProperty(ePriceGroupInstance, `DISCOUNT + OLD PRICE=${hasDiscountOrOldPrice}`, '#DISCOUNT_OLD_PRICE');
  if (!discountOldPriceSet) {
    discountOldPriceSet = processVariantProperty(ePriceGroupInstance, `Discount + Old Price=${hasDiscountOrOldPrice}`, '#DISCOUNT_OLD_PRICE');
  }
  Logger.debug(`💰 [EPriceGroup] DISCOUNT + OLD PRICE=${hasDiscountOrOldPrice}, результат: ${discountOldPriceSet}`);
  
  // Пере-поиск EPriceGroup после изменения вариантов
  const freshEPriceGroup = findInstanceByName(container, 'EPriceGroup');
  const activeEPriceGroup = freshEPriceGroup || ePriceGroupInstance;
  Logger.debug(`🔄 [EPriceGroup] Пере-поиск: ${freshEPriceGroup ? 'найден свежий' : 'используем старый'}`);
  
  // Устанавливаем значение текущей цены в EPrice
  const priceValue = row['#OrganicPrice'];
  Logger.debug(`🔍 [EPrice DEBUG] Ищем EPrice в EPriceGroup, priceValue="${priceValue}"`);
  
  // Ищем EPrice (НЕ старую цену)
  let ePriceInstance: InstanceNode | null = null;
  
  if ('children' in activeEPriceGroup) {
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
    
    Logger.debug(`🔍 [EPrice DEBUG] Найдено ${allEPrices.length} EPrice инстансов`);
    
    for (const ep of allEPrices) {
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
        Logger.debug(`🔍 [EPrice DEBUG] Выбран EPrice для текущей цены`);
        break;
      } else {
        Logger.debug(`🔍 [EPrice DEBUG] Пропущен EPrice (Old Price)`);
      }
    }
  }
  
  Logger.debug(`🔍 [EPrice DEBUG] Итоговый EPrice: ${ePriceInstance ? ePriceInstance.name : 'не найден'}`);
  
  if (ePriceInstance && ePriceInstance.componentProperties) {
    Logger.debug(`🔍 [EPrice DEBUG] Свойства EPrice:`);
    for (const pk in ePriceInstance.componentProperties) {
      const prop = ePriceInstance.componentProperties[pk];
      if (prop && typeof prop === 'object' && 'value' in prop) {
        Logger.debug(`   - ${pk}: value="${prop.value}"`);
      }
    }
    
    const propsToSet: Record<string, string> = {};
    
    // Находим view property
    const explicitView = row['#EPrice_View'];
    let viewVariants: string[];
    
    if (explicitView === 'special') {
      viewVariants = ['special', 'Special'];
    } else if (explicitView === 'default' || !hasDiscount) {
      viewVariants = ['default', 'Default'];
    } else {
      viewVariants = ['default', 'Default'];
    }
    
    Logger.debug(`🔍 [EPrice] explicitView="${explicitView}", hasDiscount=${hasDiscount}, viewVariants=${viewVariants}`);
    
    let viewPropKey: string | null = null;
    for (const propKey in ePriceInstance.componentProperties) {
      if (propKey === 'view' || propKey.startsWith('view#')) {
        viewPropKey = propKey;
        break;
      }
    }
    
    // Находим value property
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
    
    const numericPrice = priceValue ? priceValue.replace(/[^\d]/g, '') : '';
    
    Logger.debug(`🔍 [EPrice] viewPropKey="${viewPropKey}", valuePropKey="${valuePropKey}", price="${numericPrice}"`);
    
    // Пробуем установить ВСЕ свойства ОДНИМ вызовом
    let success = false;
    for (const viewValue of viewVariants) {
      try {
        if (viewPropKey) {
          propsToSet[viewPropKey] = viewValue;
        }
        if (valuePropKey && numericPrice) {
          propsToSet[valuePropKey] = numericPrice;
        }
        
        if (Object.keys(propsToSet).length > 0) {
          ePriceInstance.setProperties(propsToSet);
          Logger.debug(`✅ [EPrice] Установлены свойства:`, JSON.stringify(propsToSet));
          success = true;
          break;
        }
      } catch (e) {
        Logger.debug(`🔄 [EPrice] Не удалось с view="${viewValue}", пробуем следующий...`);
      }
    }
    
    // Если нет valuePropKey, ищем TEXT node
    if (!valuePropKey && numericPrice) {
      Logger.debug(`🔍 [EPrice] Ищем TEXT node внутри EPrice...`);
      
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
        const findPriceTextNode = (node: BaseNode): TextNode | null => {
          if (node.type === 'TEXT' && !node.removed) {
            const textNode = node as TextNode;
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
        
        let textNode = findPriceTextNode(freshEPrice);
        
        if (!textNode) {
          const findNumericTextNode = (node: BaseNode): TextNode | null => {
            if (node.type === 'TEXT' && !node.removed) {
              const tn = node as TextNode;
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
          const formattedPrice = numericPrice.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
          Logger.debug(`🔍 [EPrice] TEXT node "${textNode.name}", устанавливаем: "${formattedPrice}"`);
          
          try {
            if (textNode.fontName !== figma.mixed) {
              await figma.loadFontAsync(textNode.fontName as FontName);
            }
            textNode.characters = formattedPrice;
            Logger.debug(`✅ [EPrice] Цена установлена: "${formattedPrice}"`);
          } catch (e) {
            Logger.debug(`⚠️ [EPrice] Ошибка установки текста: ${e}`);
          }
        }
      }
    }
    
    // Если комбинированный вызов не сработал
    if (!success) {
      Logger.debug(`⚠️ [EPrice] Комбинированный вызов не сработал, пробуем по отдельности`);
      
      if (viewPropKey) {
        for (const viewValue of viewVariants) {
          try {
            ePriceInstance.setProperties({ [viewPropKey]: viewValue });
            Logger.debug(`✅ [EPrice] Установлен view=${viewValue}`);
            break;
          } catch { /* ignore */ }
        }
      }
      
      if (valuePropKey && numericPrice) {
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
        
        if (freshEPrice && freshEPrice.componentProperties) {
          for (const propKey in freshEPrice.componentProperties) {
            const propLower = propKey.toLowerCase();
            for (const pn of priceProps) {
              if (propLower === pn || propLower.startsWith(pn + '#')) {
                try {
                  freshEPrice.setProperties({ [propKey]: numericPrice });
                  Logger.debug(`✅ [EPrice] Цена через ${propKey}="${numericPrice}"`);
                } catch (e) {
                  Logger.debug(`⚠️ [EPrice] Ошибка setProperties: ${e}`);
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
    Logger.debug(`⚠️ [EPrice] EPrice не найден или не имеет componentProperties`);
  }
  
  // Fintech
  const hasFintech = row['#EPriceGroup_Fintech'] === 'true';
  processVariantProperty(activeEPriceGroup, `Fintech=${hasFintech}`, '#EPriceGroup_Fintech');
  
  const freshEPriceGroupAfterFintech = findInstanceByName(container, 'EPriceGroup');
  const ePriceGroupForFintech = freshEPriceGroupAfterFintech || activeEPriceGroup;
  Logger.debug(`🔄 [EPriceGroup] После Fintech: ${freshEPriceGroupAfterFintech ? 'найден свежий' : 'используем старый'}`);
  
  if (hasFintech) {
    let fintechInstance = findInstanceByName(ePriceGroupForFintech, 'Fintech') ||
                          findInstanceByName(ePriceGroupForFintech, 'MetaFintech') ||
                          findInstanceByName(ePriceGroupForFintech, 'Meta / Fintech') ||
                          findInstanceByName(ePriceGroupForFintech, 'Meta / Fintech ');
    
    if (!fintechInstance) {
      fintechInstance = findInstanceByName(container, 'Fintech') ||
                        findInstanceByName(container, 'MetaFintech') ||
                        findInstanceByName(container, 'Meta / Fintech') ||
                        findInstanceByName(container, 'Meta / Fintech ');
    }
    
    if (fintechInstance) {
      Logger.debug(`      💳 Найден Fintech: "${fintechInstance.name}"`);
    
      const fintechType = row['#Fintech_Type'];
      Logger.debug(`      💳 Fintech_Type: "${fintechType || 'не задан'}"`);
      
      if (fintechType) {
        let typeSet = processVariantProperty(fintechInstance, `type=${fintechType}`, '#Fintech_Type');
        if (!typeSet) typeSet = processVariantProperty(fintechInstance, `Type=${fintechType}`, '#Fintech_Type');
        if (!typeSet) processStringProperty(fintechInstance, 'type', fintechType, '#Fintech_Type');
      }
      
      const fintechView = row['#Fintech_View'];
      if (fintechView) {
        let viewSet = processVariantProperty(fintechInstance, `View=${fintechView}`, '#Fintech_View');
        if (!viewSet) viewSet = processVariantProperty(fintechInstance, `view=${fintechView}`, '#Fintech_View');
        if (!viewSet) processStringProperty(fintechInstance, 'View', fintechView, '#Fintech_View');
      }
    } else {
      Logger.warn(`      ⚠️ Fintech instance not found`);
    }
  }
}

/**
 * Обработка EPrice view (special, default и др.)
 */
export function handleEPriceView(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;

  const priceView = row['#EPrice_View'];
  if (!priceView) return;
  
  const ePriceGroupInstance = findInstanceByName(container, 'EPriceGroup');
  let ePriceInstance: InstanceNode | null = null;
  
  if (ePriceGroupInstance) {
    ePriceInstance = findInstanceByName(ePriceGroupInstance, 'EPrice');
  }
  
  if (!ePriceInstance) {
    ePriceInstance = findInstanceByName(container, 'EPrice');
  }
  
  if (ePriceInstance) {
    Logger.debug(`🔍 [EPrice View] Найден EPrice, устанавливаем view=${priceView}`);
    
    let viewSet = processVariantProperty(ePriceInstance, `view=${priceView}`, '#EPrice_View');
    if (!viewSet) viewSet = processVariantProperty(ePriceInstance, `View=${priceView}`, '#EPrice_View');
    if (!viewSet) processStringProperty(ePriceInstance, 'view', priceView, '#EPrice_View');
    
    Logger.debug(`   💰 [EPrice] view=${priceView}, результат: ${viewSet}`);
  } else {
    Logger.debug(`⚠️ [EPrice View] EPrice не найден`);
  }
}

/**
 * Обработка LabelDiscount view и prefix
 */
export async function handleLabelDiscountView(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const labelView = row['#LabelDiscount_View'];
  const discountPrefix = row['#DiscountPrefix'];
  const discountValue = row['#discount'] || row['#DiscountPercent'];
  
  const ePriceGroupInstance = findInstanceByName(container, 'EPriceGroup');
  
  const findLabelDiscount = (searchIn: BaseNode | null): InstanceNode | null => {
    if (!searchIn) return null;
    return findInstanceByName(searchIn, 'LabelDiscount') ||
           findInstanceByName(searchIn, 'Discount') ||
           findInstanceByName(searchIn, 'Label / Discount');
  };
  
  let labelDiscountInstance = findLabelDiscount(ePriceGroupInstance) || findLabelDiscount(container);
  
  if (!labelDiscountInstance) {
    if (labelView || discountPrefix) {
      Logger.warn(`   ⚠️ [LabelDiscount] Инстанс не найден`);
    }
    return;
  }
  
  Logger.debug(`   🏷️ [LabelDiscount] Найден инстанс: "${labelDiscountInstance.name}"`);
  
  // Устанавливаем View variant
  if (labelView) {
    Logger.debug(`   🏷️ [LabelDiscount] Пробуем View=${labelView}...`);
    let viewSet = processVariantProperty(labelDiscountInstance, `View=${labelView}`, '#LabelDiscount_View');
    if (!viewSet) viewSet = processVariantProperty(labelDiscountInstance, `view=${labelView}`, '#LabelDiscount_View');
    if (!viewSet) processStringProperty(labelDiscountInstance, 'View', labelView, '#LabelDiscount_View');
    Logger.debug(`   🏷️ [LabelDiscount] View=${labelView} результат: ${viewSet}`);
    
    const freshLabelDiscount = findLabelDiscount(ePriceGroupInstance) || findLabelDiscount(container);
    if (freshLabelDiscount) {
      labelDiscountInstance = freshLabelDiscount;
      Logger.debug(`🔄 [LabelDiscount] Пере-поиск после View: найден свежий`);
    }
  }
  
  // Устанавливаем текст скидки
  if (discountValue) {
    const discountText = discountValue;
    Logger.debug(`   🏷️ [LabelDiscount] Устанавливаем текст: "${discountText}"`);
    
    const findDiscountTextNode = (node: BaseNode): TextNode | null => {
      if (node.type === 'TEXT' && !node.removed) {
        const textNode = node as TextNode;
        const nameLower = textNode.name.toLowerCase();
        // Ищем TEXT по имени: content, discount, value, label
        // НЕ используем /\d/.test — это может захватить цену из соседнего узла!
        if (nameLower.includes('content') ||
            nameLower.includes('discount') ||
            nameLower.includes('value') ||
            nameLower.includes('label')) {
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
    
    let textNode = findDiscountTextNode(labelDiscountInstance);
    
    // Fallback: если не нашли по имени, берём первый TEXT node внутри LabelDiscount
    if (!textNode) {
      const findFirstTextNode = (node: BaseNode): TextNode | null => {
        if (node.type === 'TEXT' && !node.removed) {
          return node as TextNode;
        }
        if ('children' in node && node.children) {
          for (const child of node.children) {
            const found = findFirstTextNode(child);
            if (found) return found;
          }
        }
        return null;
      };
      textNode = findFirstTextNode(labelDiscountInstance);
      if (textNode) {
        Logger.debug(`   🏷️ [LabelDiscount] Fallback: найден первый TEXT "${textNode.name}"`);
      }
    }
    
    if (textNode) {
      try {
        if (textNode.fontName !== figma.mixed) {
          await figma.loadFontAsync(textNode.fontName as FontName);
          textNode.characters = discountText;
          Logger.debug(`✅ [LabelDiscount] Текст установлен: "${discountText}"`);
        } else {
          Logger.debug(`⚠️ [LabelDiscount] Mixed fonts, пропускаем`);
        }
      } catch (e) {
        Logger.debug(`⚠️ [LabelDiscount] Ошибка установки текста: ${e}`);
      }
    } else {
      Logger.debug(`   ⚠️ [LabelDiscount] TEXT node не найден`);
    }
  }
}
