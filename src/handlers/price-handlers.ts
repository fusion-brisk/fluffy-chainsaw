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
  
  const ePriceGroupInstance = getCachedInstance(instanceCache!, config.name);
  
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
  }
}

/**
 * Настраивает type и view для Fintech
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

  const explicitView = row['#EPrice_View'] as string | undefined;
  
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
    // Устанавливаем view
    const viewSet = trySetProperty(ePriceInstance, ['view', 'View'], priceView, '#EPrice_View');
    
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
