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
  
  console.log(`🔵 [EPriceGroup] Handler вызван, container=${container ? 'есть' : 'null'}, row=${row ? 'есть' : 'null'}`);
  
  if (!container || !row) return;

  const containerName = (container && 'name' in container) ? String(container.name) : 'unknown';
  const config = COMPONENT_CONFIG.EPriceGroup;
  
  console.log(`🔵 [EPriceGroup] Контейнер: "${containerName}", ищем EPriceGroup...`);
  
  const ePriceGroupInstance = getCachedInstance(instanceCache!, config.name);
  
  if (!ePriceGroupInstance) {
    console.log(`🔵 [EPriceGroup] ❌ Не найден в "${containerName}"`);
    return;
  }
  
  console.log(`🔵 [EPriceGroup] ✅ Найден в "${containerName}"`);
  
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
  
  // withBarometer — показать индикатор барометра в EPriceGroup
  // ВАЖНО: Для EProductSnippet/EProductSnippet2 барометр в EPriceGroup ВСЕГДА выключен!
  // (барометр показывается поверх картинки, а не в EPriceGroup)
  const isProductSnippet = containerName === 'EProductSnippet' || containerName === 'EProductSnippet2';
  
  let hasBarometer = false;
  if (!isProductSnippet) {
    // Для других сниппетов — по данным
    const barometerFlag = row['#ELabelGroup_Barometer'] || '';
    hasBarometer = barometerFlag === 'true';
  }
  
  console.log(`🔴 [EPriceGroup] Barometer: container="${containerName}", isProductSnippet=${isProductSnippet} → hasBarometer=${hasBarometer}`);
  
  trySetProperty(ePriceGroupInstance, ['withBarometer'], hasBarometer, '#withBarometer');
  
  // withDisclaimer — "Цена, доставка от Маркета"
  const hasDisclaimer = row['#PriceDisclaimer'] === 'true';
  trySetProperty(ePriceGroupInstance, ['withDisclaimer'], hasDisclaimer, '#PriceDisclaimer');
  
  // plusCashback — кэшбек Plus
  const hasPlusCashback = row['#PlusCashback'] === 'true';
  trySetProperty(ePriceGroupInstance, ['plusCashback'], hasPlusCashback, '#PlusCashback');
  
  // expCalculation — расчёт (4 × 10 000 ₽)
  // ВАЖНО: В Figma свойство называется "[EXP] Calculation" с пробелами и скобками
  const hasExpCalculation = row['#ExpCalculation'] === 'true';
  trySetProperty(ePriceGroupInstance, ['[EXP] Calculation', 'expCalculation'], hasExpCalculation, '#ExpCalculation');
  
  Logger.debug(`💰 [EPriceGroup] Пропсы: withLabelDiscount=${hasDiscount}, withPriceOld=${hasOldPrice}, withFintech=${hasFintech}, withBarometer=${hasBarometer}, withDisclaimer=${hasDisclaimer}`);
  Logger.debug(`💰 [EPriceGroup] Данные: #OrganicPrice="${row['#OrganicPrice'] || ''}", #OldPrice="${row['#OldPrice'] || ''}", #discount="${row['#discount'] || ''}"`);
  
  // === Заполняем текстовые значения ===
  
  // Текущая цена
  const priceValue = row['#OrganicPrice'];
  Logger.info(`💰 [EPriceGroup] Данные цен: #OrganicPrice="${priceValue || ''}", #OldPrice="${row['#OldPrice'] || ''}", hasOldPrice=${hasOldPrice}`);
  
  if (priceValue) {
    await setEPriceValue(ePriceGroupInstance, priceValue, instanceCache);
  }
  
  // Старая цена
  const oldPriceValue = row['#OldPrice'];
  if (oldPriceValue && hasOldPrice) {
    Logger.info(`💰 [EPriceGroup] Устанавливаем старую цену: "${oldPriceValue}"`);
    await setOldPriceValue(ePriceGroupInstance, oldPriceValue, instanceCache);
  } else {
    Logger.debug(`💰 [EPriceGroup] Пропуск старой цены: oldPriceValue="${oldPriceValue}", hasOldPrice=${hasOldPrice}`);
  }
  
  // Настройка Fintech type/view
  if (hasFintech) {
    await configureFintechType(ePriceGroupInstance, row, instanceCache);
  }
}

/**
 * Находит все EPrice инстансы в EPriceGroup
 */
function findAllEPriceInstances(ePriceGroupInstance: InstanceNode): InstanceNode[] {
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
  
  if ('children' in ePriceGroupInstance) {
    findAllEPrice(ePriceGroupInstance);
  }
  
  return allEPrices;
}

/**
 * Проверяет, является ли EPrice старой ценой
 * Критерий: свойство view=old или View=old
 */
function isOldPriceInstance(ep: InstanceNode, _rootId: string): boolean {
  if (!ep.componentProperties) return false;
  
  // Ищем свойство view/View
  for (const propKey in ep.componentProperties) {
    const propLower = propKey.toLowerCase();
    if (propLower === 'view' || propLower.startsWith('view#')) {
      const prop = ep.componentProperties[propKey];
      if (prop.type === 'VARIANT' && typeof prop.value === 'string') {
        const val = prop.value.toLowerCase();
        if (val === 'old') {
          return true;
        }
      }
    }
  }
  
  // Fallback: проверка родителя на "Old" в имени
  let parent = ep.parent;
  while (parent) {
    if (parent.name && (parent.name.includes('Old') || parent.name.includes('old') || parent.name.includes('PriceOld'))) {
      return true;
    }
    if ('parent' in parent) {
      parent = parent.parent;
    } else {
      break;
    }
  }
  return false;
}

/**
 * Устанавливает значение цены в EPrice инстанс
 */
function setPriceToInstance(ePriceInstance: InstanceNode, priceValue: string, label: string): boolean {
  const numericPrice = priceValue.replace(/[^\d]/g, '');
  if (!numericPrice) {
    Logger.warn(`⚠️ [${label}] Пустая числовая цена из "${priceValue}"`);
    return false;
  }
  
  // Выводим все доступные свойства для диагностики
  const allProps = ePriceInstance.componentProperties 
    ? Object.keys(ePriceInstance.componentProperties) 
    : [];
  Logger.info(`💰 [${label}] EPrice свойства: [${allProps.join(', ')}]`);
  
  // Расширенный список возможных имён свойств для цены
  const priceProps = ['value', 'text', 'content', 'price', 'amount', 'sum', 'cost'];
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
        Logger.info(`✅ [${label}] Цена установлена через ${valuePropKey}: "${numericPrice}"`);
        return true;
      } catch (e) {
        Logger.warn(`⚠️ [${label}] Ошибка setProperties(${valuePropKey}): ${e}`);
      }
    } else {
      Logger.warn(`⚠️ [${label}] Не найдено свойство цены среди [${allProps.join(', ')}]`);
    }
  } else {
    Logger.warn(`⚠️ [${label}] У EPrice нет componentProperties`);
  }
  
  return false;
}

/**
 * Устанавливает значение цены в EPrice (НЕ старую цену)
 */
async function setEPriceValue(
  ePriceGroupInstance: InstanceNode,
  priceValue: string,
  instanceCache: unknown
): Promise<void> {
  const allEPrices = findAllEPriceInstances(ePriceGroupInstance);
  
  // Ищем EPrice, который НЕ является старой ценой
  for (const ep of allEPrices) {
    if (!isOldPriceInstance(ep, ePriceGroupInstance.id)) {
      if (setPriceToInstance(ep, priceValue, 'EPrice')) {
        return;
      }
    }
  }
  
  Logger.debug(`⚠️ [EPrice] Не найден для установки текущей цены`);
}

/**
 * Устанавливает значение СТАРОЙ цены в EPrice внутри контейнера "Old"
 */
async function setOldPriceValue(
  ePriceGroupInstance: InstanceNode,
  oldPriceValue: string,
  instanceCache: unknown
): Promise<void> {
  const allEPrices = findAllEPriceInstances(ePriceGroupInstance);
  
  // Выводим имена всех найденных EPrice для диагностики
  const ePriceNames = allEPrices.map(ep => {
    const parentName = ep.parent && 'name' in ep.parent ? ep.parent.name : '?';
    return `${ep.name}(parent:${parentName})`;
  });
  Logger.info(`💰 [OldPrice] Найдено ${allEPrices.length} EPrice: [${ePriceNames.join(', ')}]`);
  
  // Ищем EPrice, который ЯВЛЯЕТСЯ старой ценой (внутри контейнера "Old")
  for (const ep of allEPrices) {
    const isOld = isOldPriceInstance(ep, ePriceGroupInstance.id);
    Logger.info(`💰 [OldPrice] Проверяем "${ep.name}" → isOld=${isOld}`);
    if (isOld) {
      Logger.info(`💰 [OldPrice] Найден EPrice внутри Old-контейнера: "${ep.name}"`);
      if (setPriceToInstance(ep, oldPriceValue, 'OldPrice')) {
        Logger.info(`💰 [OldPrice] ✅ Цена установлена: "${oldPriceValue}"`);
        return;
      }
    }
  }
  
  // FALLBACK 1: Ищем EPrice через кэш (EPriceGroup-PriceOld или подобные)
  if (instanceCache) {
    const oldPriceInstance = getCachedInstanceByNames(
      instanceCache as DeepCache, 
      ['EPriceGroup-PriceOld', 'PriceOld', 'EPrice_old', 'OldPrice', 'Old']
    );
    if (oldPriceInstance) {
      Logger.info(`💰 [OldPrice] Найден через кэш: "${oldPriceInstance.name}"`);
      // Ищем EPrice внутри
      const innerEPrice = oldPriceInstance.name === 'EPrice' 
        ? oldPriceInstance 
        : getCachedInstance(instanceCache as DeepCache, 'EPrice');
      if (innerEPrice && setPriceToInstance(innerEPrice, oldPriceValue, 'OldPrice-cached')) {
        Logger.info(`💰 [OldPrice] ✅ Цена установлена через кэш: "${oldPriceValue}"`);
        return;
      }
    }
  }
  
  // FALLBACK 2: Если есть только 2 EPrice — второй это старая цена
  if (allEPrices.length === 2) {
    Logger.info(`💰 [OldPrice] Fallback: 2 EPrice найдено, используем второй как старую цену`);
    if (setPriceToInstance(allEPrices[1], oldPriceValue, 'OldPrice-second')) {
      Logger.info(`💰 [OldPrice] ✅ Цена установлена (fallback): "${oldPriceValue}"`);
      return;
    }
  }
  
  Logger.warn(`⚠️ [OldPrice] Не найден EPrice для старой цены (всего EPrice: ${allEPrices.length})`);
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
    Logger.debug(`🔍 [EPrice View] Найден EPrice, устанавливаем view=${priceView} (explicit: ${explicitView || 'none'}), result=${viewSet}`);
    
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
  // Default: 'outlinePrimary' (обычная синяя скидка)
  // 'outlineSpecial' используется только для "Вам –X%" (зелёная)
  const effectiveView = labelView || 'outlinePrimary';
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
