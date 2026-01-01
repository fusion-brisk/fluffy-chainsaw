/**
 * Обработчики цен и скидок
 * - handleEPriceGroup — EPriceGroup (все boolean пропсы)
 * - handleEPriceView — EPrice view (special, default)
 * - handleLabelDiscountView — LabelDiscount view и текст
 * - handleInfoIcon — DEPRECATED: InfoIcon управляется через withFintech
 * 
 * Все visibility теперь через свойства EPriceGroup:
 * withBarometer, withDisclaimer, withLabelDiscount, withPriceOld, withFintech, 
 * expCalculation, plusCashback
 */

import { COMPONENT_CONFIG } from '../config';
import { Logger } from '../logger';
import { trySetProperty } from '../property-utils';
import {
  getCachedInstance,
  getCachedInstanceByNames,
  DeepCache
} from '../utils/instance-cache';
import { HandlerContext } from './types';

/**
 * Обработка EPriceGroup — основной обработчик цен
 * Все visibility управляются через boolean свойства EPriceGroup
 */
export async function handleEPriceGroup(context: HandlerContext): Promise<void> {
  const { container, row, instanceCache } = context;
  if (!container || !row) return;

  const containerName = (container && 'name' in container) ? String(container.name) : 'unknown';
  const config = COMPONENT_CONFIG.EPriceGroup;
  
<<<<<<< HEAD
  const ePriceGroupInstance = getCachedInstance(instanceCache!, config.name);
=======
  if (!ePriceGroupInstance) {
    console.log(`⚠️ [EPriceGroup] Не найден в контейнере "${containerName}"`);
    return;
  }
  
  const hasFintechData = row['#EPriceGroup_Fintech'] === 'true';
  const fintechTypeData = row['#Fintech_Type'] || 'N/A';
  console.log(`✅ [EPriceGroup] Найден в "${containerName}", Fintech=${hasFintechData}, type="${fintechTypeData}"`);
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
  
  if (!ePriceGroupInstance) {
    Logger.debug(`⚠️ [EPriceGroup] Не найден в контейнере "${containerName}"`);
    return;
  }
  
  Logger.debug(`✅ [EPriceGroup] Найден в "${containerName}"`);
  
  // === Boolean свойства EPriceGroup ===
  
  // withLabelDiscount — показать лейбл скидки
  const hasDiscount = row['#EPriceGroup_Discount'] === 'true' || row['#Discount'] === 'true';
  trySetProperty(ePriceGroupInstance, ['withLabelDiscount'], hasDiscount, '#EPriceGroup_Discount');
  
  // withPriceOld — показать старую цену
  const hasOldPrice = row['#EPriceGroup_OldPrice'] === 'true' || hasDiscount;
  trySetProperty(ePriceGroupInstance, ['withPriceOld'], hasOldPrice, '#EPriceGroup_OldPrice');
  
  // withFintech — показать финтех (Сплит и др.)
  const hasFintech = row['#EPriceGroup_Fintech'] === 'true';
  trySetProperty(ePriceGroupInstance, ['withFintech'], hasFintech, '#EPriceGroup_Fintech');
  
  // withBarometer — показать индикатор барометра
  const hasBarometer = !!(row['#EPriceBarometer_View'] && row['#EPriceBarometer_View'].trim() !== '');
  trySetProperty(ePriceGroupInstance, ['withBarometer'], hasBarometer, '#withBarometer');
  
  // withDisclaimer — "Цена, доставка от Маркета"
  const hasDisclaimer = row['#PriceDisclaimer'] === 'true';
  trySetProperty(ePriceGroupInstance, ['withDisclaimer'], hasDisclaimer, '#PriceDisclaimer');
  
  // plusCashback — кэшбек Plus
  const hasPlusCashback = row['#PlusCashback'] === 'true';
  trySetProperty(ePriceGroupInstance, ['plusCashback'], hasPlusCashback, '#PlusCashback');
  
  // expCalculation — расчёт (4 × 10 000 ₽)
  const hasExpCalculation = row['#ExpCalculation'] === 'true';
  trySetProperty(ePriceGroupInstance, ['expCalculation'], hasExpCalculation, '#ExpCalculation');
  
  Logger.debug(`💰 [EPriceGroup] Пропсы: withLabelDiscount=${hasDiscount}, withPriceOld=${hasOldPrice}, withFintech=${hasFintech}, withBarometer=${hasBarometer}, withDisclaimer=${hasDisclaimer}`);
  
  // === Заполняем текстовые значения ===
  
  // Текущая цена
  const priceValue = row['#OrganicPrice'];
  if (priceValue) {
    await setEPriceValue(ePriceGroupInstance, priceValue, instanceCache);
  }
  
  // Настройка Fintech type/view
  if (hasFintech) {
    await configureFintechType(ePriceGroupInstance, row, instanceCache);
  }
}

/**
 * Устанавливает значение цены в EPrice
 */
async function setEPriceValue(
  ePriceGroupInstance: InstanceNode,
  priceValue: string,
  instanceCache: unknown
): Promise<void> {
  // Ищем EPrice (НЕ старую цену)
  let ePriceInstance: InstanceNode | null = null;
  
  if ('children' in ePriceGroupInstance) {
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
    findAllEPrice(ePriceGroupInstance);
    
    for (const ep of allEPrices) {
      let parent = ep.parent;
      let isOldPrice = false;
      while (parent && parent.id !== ePriceGroupInstance.id) {
        if (parent.name && (parent.name.includes('Old') || parent.name.includes('old'))) {
          isOldPrice = true;
          break;
        }
        parent = parent.parent;
      }
      
      if (!isOldPrice) {
        ePriceInstance = ep;
        break;
      }
    }
  }
  
  if (!ePriceInstance) {
    Logger.debug(`⚠️ [EPrice] Не найден для установки цены`);
    return;
  }
  
  const numericPrice = priceValue.replace(/[^\d]/g, '');
  if (!numericPrice) return;
  
  // Пробуем установить через свойство value
  const priceProps = ['value', 'text', 'content', 'price'];
  let valuePropKey: string | null = null;
  
  if (ePriceInstance.componentProperties) {
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
    
    if (valuePropKey) {
      try {
        ePriceInstance.setProperties({ [valuePropKey]: numericPrice });
        Logger.debug(`✅ [EPrice] Цена установлена через ${valuePropKey}: "${numericPrice}"`);
      } catch (e) {
        Logger.debug(`⚠️ [EPrice] Ошибка setProperties: ${e}`);
      }
    }
<<<<<<< HEAD
=======
    
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
  
  // Ищем Fintech instance (разные варианты имён)
  const fintechNames = ['Meta / Fintech', 'Meta/Fintech', 'MetaFintech', 'Fintech', 'Meta / Fintech '];
  let fintechInstance: InstanceNode | null = null;
  
  for (const name of fintechNames) {
    fintechInstance = findInstanceByName(ePriceGroupForFintech, name);
    if (fintechInstance) {
      Logger.debug(`      💳 Найден Fintech в EPriceGroup: "${name}"`);
      break;
    }
  }
  
  if (!fintechInstance) {
    for (const name of fintechNames) {
      fintechInstance = findInstanceByName(container, name);
      if (fintechInstance) {
        Logger.debug(`      💳 Найден Fintech в container: "${name}"`);
        break;
      }
    }
  }
  
  if (fintechInstance) {
    // Управляем видимостью Fintech wrapper — скрываем если нет данных
    try {
      fintechInstance.visible = hasFintech;
      Logger.debug(`      💳 Fintech wrapper visible=${hasFintech}`);
    } catch (e) {
      Logger.error(`      ❌ Fintech visible error:`, e);
    }
    
    if (hasFintech) {
      console.log(`💳 [Fintech] Найден wrapper: "${fintechInstance.name}"`);
      
      // Wrapper может называться "Meta / Fintech ", а внутри него — "MetaFintech" с variant properties
      // Ищем MetaFintech внутри wrapper'а
      let metaFintechInstance: InstanceNode | null = null;
      const innerFintechNames = ['MetaFintech', 'Meta Fintech', 'Fintech'];
      
      for (const innerName of innerFintechNames) {
        metaFintechInstance = findInstanceByName(fintechInstance, innerName);
        if (metaFintechInstance) {
          console.log(`💳 [Fintech] Найден MetaFintech внутри wrapper: "${innerName}"`);
          break;
        }
      }
      
      // Если не нашли вложенный, используем сам wrapper (на случай если это и есть MetaFintech)
      const targetInstance = metaFintechInstance || fintechInstance;
      console.log(`💳 [Fintech] Целевой instance: "${targetInstance.name}"`);
      
      // Логируем доступные свойства целевого instance
      if (targetInstance.componentProperties) {
        const props = targetInstance.componentProperties;
        for (const key in props) {
          const prop = props[key];
          if (prop && typeof prop === 'object' && 'type' in prop && prop.type === 'VARIANT') {
            const options = 'options' in prop ? (prop.options as string[]) : [];
            console.log(`💳 [Fintech] Свойство "${key}": опции=[${options.join(', ')}]`);
          }
        }
      }
    
      const fintechType = row['#Fintech_Type'];
      console.log(`💳 [Fintech] #Fintech_Type из данных: "${fintechType || 'не задан'}"`);
      
      if (fintechType) {
        console.log(`💳 [Fintech] Пробуем type=${fintechType}...`);
        let typeSet = processVariantProperty(targetInstance, `type=${fintechType}`, '#Fintech_Type');
        console.log(`💳 [Fintech] type=${fintechType} результат: ${typeSet}`);
        if (!typeSet) {
          console.log(`💳 [Fintech] Пробуем Type=${fintechType}...`);
          typeSet = processVariantProperty(targetInstance, `Type=${fintechType}`, '#Fintech_Type');
          console.log(`💳 [Fintech] Type=${fintechType} результат: ${typeSet}`);
        }
        if (!typeSet) {
          console.log(`💳 [Fintech] Пробуем stringProperty...`);
          processStringProperty(targetInstance, 'type', fintechType, '#Fintech_Type');
        }
      }
      
      const fintechView = row['#Fintech_View'];
      if (fintechView) {
        let viewSet = processVariantProperty(targetInstance, `View=${fintechView}`, '#Fintech_View');
        if (!viewSet) viewSet = processVariantProperty(targetInstance, `view=${fintechView}`, '#Fintech_View');
        if (!viewSet) processStringProperty(targetInstance, 'View', fintechView, '#Fintech_View');
      }
    }
  } else if (!hasFintech) {
    // Fintech не найден и не нужен — OK
    Logger.debug(`      💳 Fintech не найден (и не нужен)`);
  } else {
    Logger.warn(`      ⚠️ Fintech instance not found (но данные есть)`);
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
  }
}

/**
<<<<<<< HEAD
 * Настраивает type и view для Fintech
=======
 * Обработка EPrice view (special, undefined и др.)
 * ВАЖНО: Всегда устанавливаем view — либо special, либо undefined
 * Это нужно чтобы сбросить предыдущее состояние компонента
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
 */
async function configureFintechType(
  ePriceGroupInstance: InstanceNode,
  row: Record<string, string | undefined>,
  instanceCache: unknown
): Promise<void> {
  const fintechNames = ['Meta / Fintech', 'Meta/Fintech', 'MetaFintech', 'Fintech'];
  const fintechInstance = getCachedInstanceByNames(instanceCache as DeepCache, fintechNames);
  
  if (!fintechInstance) {
    Logger.debug(`⚠️ [Fintech] Инстанс не найден`);
    return;
  }
  
  // Ищем вложенный MetaFintech
  const innerFintechNames = ['MetaFintech', 'Meta Fintech'];
  const metaFintechInstance = getCachedInstanceByNames(instanceCache as DeepCache, innerFintechNames);
  const targetInstance = metaFintechInstance || fintechInstance;
  
  // Устанавливаем type
  const fintechType = row['#Fintech_Type'];
  if (fintechType) {
    const typeSet = trySetProperty(targetInstance, ['type', 'Type'], fintechType, '#Fintech_Type');
    Logger.debug(`💳 [Fintech] type=${fintechType}, result=${typeSet}`);
  }
  
  // Устанавливаем view
  const fintechView = row['#Fintech_View'];
  if (fintechView) {
    trySetProperty(targetInstance, ['View', 'view'], fintechView, '#Fintech_View');
  }
}

/**
 * Обработка EPrice view
 * Возможные значения: "undefined" (обычная), "special" (красная), "old" (зачёркнутая)
 */
export async function handleEPriceView(context: HandlerContext): Promise<void> {
  const { container, row, instanceCache } = context;
  if (!container || !row) return;

<<<<<<< HEAD
  const explicitView = row['#EPrice_View'] as string | undefined;
=======
  // Определяем view: если есть #EPrice_View=special, используем его, иначе undefined
  const explicitView = row['#EPrice_View'];
  const priceView = explicitView === 'special' ? 'special' : 'undefined';
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
  
  // Маппинг значений: 'default' → 'undefined', остальные как есть
  let priceView: string;
  if (explicitView === 'special') {
    priceView = 'special';
  } else if (explicitView === 'old') {
    priceView = 'old';
  } else {
    priceView = 'undefined'; // Figma использует 'undefined' вместо 'default'
  }
  
  const ePriceInstance = getCachedInstance(instanceCache!, 'EPrice');
  
  if (ePriceInstance) {
<<<<<<< HEAD
    // Устанавливаем view
    const viewSet = trySetProperty(ePriceInstance, ['view', 'View'], priceView, '#EPrice_View');
=======
    Logger.debug(`🔍 [EPrice View] Найден EPrice, устанавливаем view=${priceView} (explicit: ${explicitView || 'none'})`);
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
    
    // Устанавливаем value (текст цены) через свойство компонента
    const priceValue = (row['#OrganicPrice'] || row['#EPrice_Value'] || '').trim();
    if (priceValue) {
      const valueSet = trySetProperty(ePriceInstance, ['value'], priceValue, '#EPrice_Value');
      Logger.debug(`💰 [EPrice] value="${priceValue}", result=${valueSet}`);
    }
    
    Logger.debug(`💰 [EPrice] view=${priceView}, result=${viewSet}`);
  }
}

/**
 * Обработка LabelDiscount view и текст
 * Visibility теперь через withLabelDiscount на EPriceGroup
 */
export async function handleLabelDiscountView(context: HandlerContext): Promise<void> {
  const { container, row, instanceCache } = context;
  if (!container || !row) return;

  const labelView = row['#LabelDiscount_View'];
  const discountValue = row['#discount'] || row['#DiscountPercent'];
  const hasDiscount = row['#EPriceGroup_Discount'] === 'true' || row['#Discount'] === 'true';
  
  // Если нет скидки — ничего не делаем (visibility через withLabelDiscount)
  if (!hasDiscount) return;
  
  const labelDiscountInstance = getCachedInstanceByNames(instanceCache!, ['LabelDiscount', 'Discount', 'Label / Discount']);
  
  if (!labelDiscountInstance) {
    if (labelView || discountValue) {
      Logger.debug(`⚠️ [LabelDiscount] Инстанс не найден`);
    }
    return;
  }
  
  // Устанавливаем View variant
  const effectiveView = labelView || 'outlineSpecial';
  const viewSet = trySetProperty(labelDiscountInstance, ['view', 'View'], effectiveView, '#LabelDiscount_View');
  Logger.debug(`🏷️ [LabelDiscount] View=${effectiveView}, result=${viewSet}`);
  
  // Устанавливаем текст скидки через свойство value вложенного Label
  if (discountValue) {
    // Ищем вложенный Label внутри LabelDiscount
    let labelInstance: InstanceNode | null = null;
    
    if ('children' in labelDiscountInstance) {
      for (const child of labelDiscountInstance.children) {
        if (child.type === 'INSTANCE' && child.name === 'Label') {
          labelInstance = child as InstanceNode;
          break;
        }
      }
    }
    
    if (labelInstance) {
      // Устанавливаем value через свойство компонента Label
      const valueSet = trySetProperty(labelInstance, ['value'], discountValue, '#DiscountLabel');
      Logger.debug(`✅ [LabelDiscount] value="${discountValue}" через Label, result=${valueSet}`);
    } else {
      // Fallback: устанавливаем value напрямую на LabelDiscount (если поддерживается)
      const valueSet = trySetProperty(labelDiscountInstance, ['value'], discountValue, '#DiscountLabel');
      if (valueSet) {
        Logger.debug(`✅ [LabelDiscount] value="${discountValue}" напрямую, result=${valueSet}`);
      } else {
        Logger.debug(`⚠️ [LabelDiscount] Вложенный Label не найден, value не установлен`);
      }
    }
  }
}

/**
 * Обработка InfoIcon — DEPRECATED
 * InfoIcon теперь управляется автоматически через withFintech на EPriceGroup
 * Оставлен для обратной совместимости
 */
export function handleInfoIcon(context: HandlerContext): void {
  // InfoIcon управляется через withFintech — ничего не делаем
  // Figma сама показывает/скрывает InfoIcon вместе с Fintech блоком
  Logger.debug(`ℹ️ [InfoIcon] Управляется через withFintech на EPriceGroup`);
}
