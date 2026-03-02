/**
 * Обработчики доставки и BNPL
 * - handleEDeliveryGroup — блок доставки (через withDelivery на контейнере)
 * - handleShopInfoBnpl — BNPL иконки (через withFintech на контейнере)
 * - handleShopInfoDeliveryBnplContainer — контейнер доставки/BNPL (через withMeta на контейнере)
 * 
 * Все visibility теперь через свойства родительского контейнера сниппета
 */

import { Logger } from '../logger';
import { trySetProperty } from '../property-utils';
import {
  findFirstNodeByName,
  findFirstTextByPredicate,
  findAllNodesByName,
  findAllNodesByNameContains,
  findNearestNamedAncestor,
  findAllInstances,
  findFirstTextValue,
  safeSetTextNode
} from '../utils/node-search';
import { getCachedInstance, getCachedInstanceByNames } from '../utils/instance-cache';
import { HandlerContext } from './types';

/**
 * Список основных контейнеров сниппетов
 */
const SNIPPET_CONTAINERS = ['ESnippet', 'Snippet', 'EOfferItem', 'EShopItem', 'EProductSnippet', 'EProductSnippet2', 'Organic_withOfferInfo'];

/**
 * Проверяет, является ли контейнер основным сниппетом
 */
function isSnippetContainer(container: BaseNode): boolean {
  if (!container || !('name' in container)) return false;
  return SNIPPET_CONTAINERS.indexOf(String(container.name)) !== -1;
}

/**
 * Добавляет буллит-префикс если его еще нет
 */
function withBulletPrefixIfNeeded(value: string): string {
  const s = (value || '').trim();
  if (!s) return s;
  if (s.indexOf('·') === 0) return s;
  return `· ${s}`;
}

/**
 * Маппинг BNPL лейбла к типу
 */
function mapBnplLabelToType(value: string): string | null {
  const s = (value || '').toLowerCase();
  if (!s) return null;
  const cleaned = s.replace(/\s+и\s+др\.?$/i, '').trim();

  if (cleaned.indexOf('сплит') !== -1) return 'split';
  if (cleaned.indexOf('плайт') !== -1) return 'plait';
  if (cleaned.indexOf('долями') !== -1) return 'dolyami';
  if (cleaned.indexOf('плати частями') !== -1) return 'plati chastyami';
  if (cleaned.indexOf('мокка') !== -1) return 'mokka';
  if (cleaned.indexOf('подели') !== -1) return 'podeli';
  if (cleaned.indexOf('мтс') !== -1 && (cleaned.indexOf('пэй') !== -1 || cleaned.indexOf('pay') !== -1)) return 'mts pay';
  return null;
}

/**
 * Проверка, является ли инстанс BNPL-item
 */
function isLikelyBnplItemInstance(inst: InstanceNode): boolean {
  try {
    if (!inst || inst.removed) return false;
    const props = inst.componentProperties;
    if (!props) return false;
    for (const key in props) {
      if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
      const base = String(key).split('#')[0].replace(/\s+/g, '').toLowerCase();
      if (base === 'type') return true;
    }
  } catch (e) {
    Logger.debug('[BNPL] isLikelyBnplItemInstance check failed');
  }
  return false;
}

/**
 * Определение типа BNPL из узла
 */
function detectBnplTypeFromNode(item: SceneNode): string | null {
  try {
    const graphics = findAllNodesByNameContains(item, 'Graphic / BNPL /');
    for (let i = 0; i < graphics.length; i++) {
      const n = String(graphics[i].name || '');
      const idx = n.lastIndexOf('Graphic / BNPL /');
      const tail = idx >= 0 ? n.substring(idx + 'Graphic / BNPL /'.length).trim() : '';
      const tl = tail.toLowerCase();
      if (!tl) continue;
      if (tl.indexOf('split') !== -1) return 'Split';
      if (tl.indexOf('dolyame') !== -1 || tl.indexOf('dolyami') !== -1) return 'Dolyami';
      if (tl.indexOf('plait') !== -1) return 'Plait';
      if (tl.indexOf('mokka') !== -1) return 'Mokka';
      if (tl.indexOf('mts pay') !== -1 || (tl.indexOf('mts') !== -1 && tl.indexOf('pay') !== -1)) return 'MTS Pay';
      if (tl.indexOf('podeli') !== -1) return 'Podeli';
      if (tl.indexOf('plati') !== -1) return 'Plati Chastyami';
    }
  } catch (e) {
    Logger.debug('[BNPL] detectBnplTypeFromNode graphics lookup failed');
  }

  const text = findFirstTextValue(item);
  if (text) return mapBnplLabelToType(text);

  return null;
}

/**
 * Обработка EDeliveryGroup — показать/скрыть через withDelivery на контейнере
 */
export async function handleEDeliveryGroup(context: HandlerContext): Promise<void> {
  const { container, row, instanceCache } = context;
  if (!container || !row) return;

  const containerName = (container && 'name' in container) ? String(container.name) : '';
  const itemCount = parseInt(row['#EDeliveryGroup-Count'] || '0', 10);
  const hasDeliveryData = row['#EDeliveryGroup'] === 'true' && itemCount > 0;
  const hasDeliveryList = !!(row['#DeliveryList'] && String(row['#DeliveryList']).trim() !== '');
  const isAbroad = row['#EDelivery_abroad'] === 'true';
  const hasDelivery = hasDeliveryData || hasDeliveryList || isAbroad;
  
  Logger.debug(`🚚 [EDeliveryGroup] container=${containerName}, hasDelivery=${hasDelivery}, isAbroad=${isAbroad}, itemCount=${itemCount}`);
  
  // === Устанавливаем withDelivery на родительском контейнере ===
  if (isSnippetContainer(container) && container.type === 'INSTANCE' && !container.removed) {
    const instance = container as InstanceNode;
    const withDeliverySet = trySetProperty(
      instance,
      ['withDelivery', 'Delivery', 'delivery', 'DELIVERY + FINTECH'],
      hasDelivery,
      '#withDelivery'
    );
    Logger.debug(`🚚 [EDeliveryGroup] withDelivery=${hasDelivery} на "${containerName}", result=${withDeliverySet}`);
  }
  
  // Если нет доставки — не заполняем items
  if (!hasDelivery) return;
  
  // Получаем инстанс EDeliveryGroup
  const deliveryGroupInstance = getCachedInstance(instanceCache!, 'EDeliveryGroup');
  if (!deliveryGroupInstance) {
    Logger.debug(`🚚 [EDeliveryGroup] Instance NOT FOUND`);
    return;
  }
  
  Logger.debug(`🚚 [EDeliveryGroup] Instance FOUND: "${deliveryGroupInstance.name}"`);
  
  // Обработка abroad
  if (isAbroad) {
    try {
      deliveryGroupInstance.resetOverrides();
      const abroadSet = trySetProperty(deliveryGroupInstance, ['withAbroad', 'abroad'], true, '#EDelivery_abroad');
      Logger.debug(`✈️ [EDeliveryGroup] abroad=${abroadSet}`);
    } catch (e) {
      Logger.error(`✈️ [EDeliveryGroup] ERROR:`, e);
    }
    return;
  }
  
  // === Устанавливаем видимость child-слотов через свойства (новые компоненты) ===
  const childSlotNames = ['first-child', 'second-child', 'third-child'];
  for (let i = 0; i < 3; i++) {
    const itemValue = row[`#EDeliveryGroup-Item-${i + 1}`];
    const hasItem = !!(itemValue && String(itemValue).trim() !== '' && (i + 1) <= itemCount);
    trySetProperty(deliveryGroupInstance, [childSlotNames[i]], hasItem, `#EDeliveryGroup-slot-${i + 1}`);
  }
  Logger.debug(`🚚 [EDeliveryGroup] child slots set: count=${itemCount}`);

  // Заполняем items доставки
  const itemLayers = findAllNodesByName(deliveryGroupInstance, '#EDeliveryGroup-Item');
  const lineNodes = itemLayers.length === 0 ? findAllNodesByName(deliveryGroupInstance, 'Line') : [];

  Logger.debug(`   📦 [EDeliveryGroup] items=${itemLayers.length}, lines=${lineNodes.length}, data=${itemCount}`);
  
  // MODE A: legacy (named #EDeliveryGroup-Item targets)
  if (itemLayers.length > 0) {
    let visibleCounter = 0;
    const maxSlots = Math.min(3, itemLayers.length);
    for (let i = 0; i < maxSlots; i++) {
      const layer = itemLayers[i];
      const dataIndex = i + 1;
      const itemValue = row[`#EDeliveryGroup-Item-${dataIndex}`];
      
      if (itemValue && dataIndex <= itemCount) {
        if (layer.type === 'TEXT') {
          const textNode = layer as TextNode;
          visibleCounter++;
          const finalValue = visibleCounter > 1 ? withBulletPrefixIfNeeded(itemValue) : itemValue;
          await safeSetTextNode(textNode, finalValue);
          Logger.debug(`      ✅ Item ${dataIndex}: "${finalValue}"`);
        }
      }
    }
    return;
  }

  // MODE B: Line instances with value property
  const values: string[] = [];
  for (let i = 1; i <= Math.min(3, itemCount); i++) {
    const v = row[`#EDeliveryGroup-Item-${i}`];
    if (v && String(v).trim() !== '') values.push(String(v).trim());
  }

  // Strategy 1: Set value property on Line instances directly
  if (lineNodes.length > 0 && values.length > 0) {
    let valueSet = 0;
    for (let i = 0; i < Math.min(lineNodes.length, values.length); i++) {
      const ln = lineNodes[i] as SceneNode;
      if (ln.type === 'INSTANCE') {
        const finalValue = i > 0 ? withBulletPrefixIfNeeded(values[i]) : values[i];
        try {
          (ln as InstanceNode).setProperties({ value: finalValue });
          valueSet++;
          Logger.debug(`      ✅ Line[${i}].value set: "${finalValue}"`);
        } catch (_e) { Logger.debug('[EDeliveryGroup] Line[' + i + '].value set failed'); }
      }
    }
    if (valueSet > 0) return;
  }

  // Strategy 2: Fallback to text node search inside Line instances
  for (let i = 0; i < Math.min(lineNodes.length, values.length); i++) {
    const ln = lineNodes[i] as SceneNode;
    const finalValue = i > 0 ? withBulletPrefixIfNeeded(values[i]) : values[i];
    const tn = findFirstTextByPredicate(ln, () => true);
    if (tn) {
      await safeSetTextNode(tn, finalValue);
      Logger.debug(`      ✅ Line[${i}] text fallback: "${finalValue}"`);
    }
  }
}

/**
 * ShopInfo-Bnpl — управление через withFintech на контейнере
 */
export async function handleShopInfoBnpl(context: HandlerContext): Promise<void> {
  const { container, row, instanceCache } = context;
  if (!container || !row) return;

  const containerName = (container && 'name' in container) ? String(container.name) : '';
  
  const shopCount = parseInt(row['#ShopInfo-Bnpl-Count'] || '0', 10);
  const shopHas = row['#ShopInfo-Bnpl'] === 'true' && shopCount > 0;
  const ebnplCount = parseInt(row['#EBnpl-Count'] || '0', 10);
  const ebnplHas = row['#EBnpl'] === 'true' && ebnplCount > 0;
  const hasFintechFromPrice = row['#EPriceGroup_Fintech'] === 'true';

  const count = shopHas ? shopCount : ebnplCount;
  const hasFintech = (shopHas || ebnplHas || hasFintechFromPrice) && count > 0;

  Logger.debug(`🧾 [ShopInfo-Bnpl] container=${containerName}, hasFintech=${hasFintech}, count=${count}`);

  // === Устанавливаем withFintech на родительском контейнере ===
  if (isSnippetContainer(container) && container.type === 'INSTANCE' && !container.removed) {
    const instance = container as InstanceNode;
    const withFintechSet = trySetProperty(
      instance,
      ['withFintech', 'Fintech', 'fintech'],
      hasFintech,
      '#withFintech'
    );
    Logger.debug(`🧾 [ShopInfo-Bnpl] withFintech=${hasFintech} на "${containerName}", result=${withFintechSet}`);
  }

  // Если нет финтеха — не настраиваем типы
  if (!hasFintech) return;

  // Ищем BNPL root — ОПТИМИЗИРОВАНО: используем instanceCache вместо deep traversal
  const bnplRoot: SceneNode | null =
    getCachedInstanceByNames(instanceCache!, ['#ShopInfo-Bnpl', 'ShopInfo-Bnpl', 'Line / EBnpl Group']) ||
    getCachedInstance(instanceCache!, 'EBnpl') ||
    // Fallback на deep traversal только если кэш не помог
    (findAllNodesByName(container, '#ShopInfo-Bnpl')[0] as SceneNode | undefined) ||
    (findAllNodesByName(container, 'ShopInfo-Bnpl')[0] as SceneNode | undefined) ||
    null;

  if (!bnplRoot) {
    Logger.debug(`🧾 [ShopInfo-Bnpl] BNPL root не найден`);
    return;
  }

  // Определяем типы BNPL
  const desiredTypes: string[] = [];
  for (let i = 1; i <= count && i <= 3; i++) {
    const v = shopHas ? (row[`#ShopInfo-Bnpl-Item-${i}`] || '') : (row[`#EBnpl-Item-${i}`] || '');
    const mapped = mapBnplLabelToType(v);
    if (mapped && desiredTypes.indexOf(mapped) === -1) desiredTypes.push(mapped);
  }

  if (desiredTypes.length === 0) {
    Logger.debug(`🧾 [ShopInfo-Bnpl] Не удалось распознать типы`);
    return;
  }

  // === Устанавливаем видимость child-слотов через свойства (новые компоненты) ===
  if (bnplRoot.type === 'INSTANCE' && !bnplRoot.removed) {
    const childSlotNames = ['first-child', 'second-child', 'third-child'];
    for (let i = 0; i < 3; i++) {
      const hasItem = i < desiredTypes.length;
      trySetProperty(bnplRoot as InstanceNode, [childSlotNames[i]], hasItem, `#Bnpl-slot-${i + 1}`);
    }
    Logger.debug(`🧾 [ShopInfo-Bnpl] child slots set: desiredTypes=${desiredTypes.length}`);
  }

  // Находим BNPL items и устанавливаем типы
  const candidates = findAllInstances(bnplRoot);
  const allItems: InstanceNode[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const inst = candidates[i];
    if ((bnplRoot as SceneNode).id && inst.id === (bnplRoot as SceneNode).id) continue;
    if (!isLikelyBnplItemInstance(inst)) continue;
    allItems.push(inst);
  }

  if (allItems.length === 0) {
    Logger.debug(`🧾 [ShopInfo-Bnpl] Не найдено BNPL items`);
    return;
  }

  // Устанавливаем типы для видимых items (visibility через child-slot properties выше)
  const maxSlots = Math.min(3, allItems.length, desiredTypes.length);
  for (let i = 0; i < maxSlots; i++) {
    const t = desiredTypes[i];
    const ok = trySetProperty(allItems[i], ['type', 'Type'], t, '#ShopInfo-Bnpl');
    Logger.debug(`🧾 [ShopInfo-Bnpl] item[${i}] type=${t}, set=${ok}`);
  }
}

/**
 * ShopInfo-DeliveryBnplContainer — управление через withMeta на контейнере
 */
export function handleShopInfoDeliveryBnplContainer(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;

  const containerName = (container && 'name' in container) ? String(container.name) : '';

  // Определяем наличие данных
  const deliveryCount = parseInt(row['#EDeliveryGroup-Count'] || '0', 10);
  const hasDeliveryByGroup = row['#EDeliveryGroup'] === 'true' && deliveryCount > 0;
  const hasDeliveryByList = !!(row['#DeliveryList'] && String(row['#DeliveryList']).trim() !== '');
  const hasDeliveryByOfferFlag = row['#EOfferItem_hasDelivery'] === 'true';
  const hasDeliveryAbroad = row['#EDelivery_abroad'] === 'true';
  const hasDelivery = hasDeliveryByGroup || hasDeliveryByList || hasDeliveryByOfferFlag || hasDeliveryAbroad;

  const shopCount = parseInt(row['#ShopInfo-Bnpl-Count'] || '0', 10);
  const shopHas = row['#ShopInfo-Bnpl'] === 'true' && shopCount > 0;
  const ebnplCount = parseInt(row['#EBnpl-Count'] || '0', 10);
  const ebnplHas = row['#EBnpl'] === 'true' && ebnplCount > 0;
  const hasFintechFromPrice = row['#EPriceGroup_Fintech'] === 'true';
  const hasFintech = shopHas || ebnplHas || hasFintechFromPrice;

  const hasMeta = hasDelivery || hasFintech;

  Logger.debug(`🚚💳 [DeliveryBnplContainer] container=${containerName}, hasMeta=${hasMeta} (delivery=${hasDelivery}, fintech=${hasFintech})`);

  // === Устанавливаем withMeta на родительском контейнере ===
  if (isSnippetContainer(container) && container.type === 'INSTANCE' && !container.removed) {
    const instance = container as InstanceNode;
    const withMetaSet = trySetProperty(
      instance,
      ['withMeta', 'Meta', 'meta', 'DELIVERY + FINTECH', 'deliveryFintech'],
      hasMeta,
      '#withMeta'
    );
    Logger.debug(`🚚💳 [DeliveryBnplContainer] withMeta=${hasMeta} на "${containerName}", result=${withMetaSet}`);
  }
}
