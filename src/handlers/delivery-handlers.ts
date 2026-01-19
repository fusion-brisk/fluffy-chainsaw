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
import { getCachedInstance } from '../utils/instance-cache';
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
    // ignore
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
    // ignore
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

  // MODE B: EProductSnippet-style (Line groups with plain Text)
  const slots: Array<{ line: SceneNode; text: TextNode | null; original: string }> = [];
  for (let i = 0; i < lineNodes.length; i++) {
    const ln = lineNodes[i] as SceneNode;
    const tn = findFirstTextByPredicate(ln, () => true);
    const orig = tn ? (tn.characters || '') : '';
    slots.push({ line: ln, text: tn, original: orig });
  }

  const bulletSlots: Array<{ idx: number }> = [];
  const plainSlots: Array<{ idx: number }> = [];
  for (let i = 0; i < slots.length; i++) {
    const txt = (slots[i].original || '').trim();
    if (txt.indexOf('·') === 0) bulletSlots.push({ idx: i });
    else plainSlots.push({ idx: i });
  }

  const values: string[] = [];
  for (let i = 1; i <= Math.min(3, itemCount); i++) {
    const v = row[`#EDeliveryGroup-Item-${i}`];
    if (v && String(v).trim() !== '') values.push(String(v).trim());
  }

  async function showSlot(slotIndex: number, value: string, forceBullet: boolean): Promise<void> {
    const slot = slots[slotIndex];
    const finalValue = forceBullet ? withBulletPrefixIfNeeded(value) : value;
    if (slot.text) {
      await safeSetTextNode(slot.text, finalValue);
    }
    // Показываем Line слот
    if (slot.line && 'visible' in slot.line) {
      (slot.line as SceneNode).visible = true;
    }
  }

  async function hideSlot(slotIndex: number): Promise<void> {
    const slot = slots[slotIndex];
    // Скрываем Line слот
    if (slot.line && 'visible' in slot.line) {
      (slot.line as SceneNode).visible = false;
      Logger.debug(`      🙈 Скрыт слот ${slotIndex}`);
    }
  }

  // Скрываем все слоты кроме тех что будем использовать
  const usedSlotIndices = new Set<number>();

  if (values.length === 1 && bulletSlots.length > 0) {
    const v0 = values[0];
    const v0l = String(v0).toLowerCase();
    if (plainSlots.length > 0 && v0l.indexOf('пвз') !== -1) {
      await showSlot(plainSlots[0].idx, 'Курьер', false);
      usedSlotIndices.add(plainSlots[0].idx);
      await showSlot(bulletSlots[0].idx, v0, true);
      usedSlotIndices.add(bulletSlots[0].idx);
    } else {
      await showSlot(bulletSlots[0].idx, v0, true);
      usedSlotIndices.add(bulletSlots[0].idx);
    }
  } else if (values.length >= 2 && (plainSlots.length > 0 || bulletSlots.length > 0)) {
    if (plainSlots.length > 0) {
      await showSlot(plainSlots[0].idx, values[0], false);
      usedSlotIndices.add(plainSlots[0].idx);
    } else {
      await showSlot(bulletSlots[0].idx, values[0], true);
      usedSlotIndices.add(bulletSlots[0].idx);
    }
    if (bulletSlots.length > 0) {
      await showSlot(bulletSlots[0].idx, values[1], true);
      usedSlotIndices.add(bulletSlots[0].idx);
    } else if (plainSlots.length > 1) {
      await showSlot(plainSlots[1].idx, values[1], true);
      usedSlotIndices.add(plainSlots[1].idx);
    }
  } else if (values.length === 1 && plainSlots.length > 0) {
    await showSlot(plainSlots[0].idx, values[0], false);
    usedSlotIndices.add(plainSlots[0].idx);
  } else if (values.length > 0) {
    for (let i = 0; i < values.length && i < slots.length; i++) {
      await showSlot(i, values[i], i > 0);
      usedSlotIndices.add(i);
    }
  }

  // Скрываем неиспользуемые слоты
  for (let i = 0; i < slots.length; i++) {
    if (!usedSlotIndices.has(i)) {
      await hideSlot(i);
    }
  }
}

/**
 * ShopInfo-Bnpl — управление через withFintech на контейнере
 */
export async function handleShopInfoBnpl(context: HandlerContext): Promise<void> {
  const { container, row } = context;
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

  // Ищем BNPL root
  const bnplRoot =
    (findAllNodesByName(container, '#ShopInfo-Bnpl')[0] as SceneNode | undefined) ||
    (findAllNodesByName(container, 'ShopInfo-Bnpl')[0] as SceneNode | undefined) ||
    (findAllNodesByName(container, 'Line / EBnpl Group')[0] as SceneNode | undefined) ||
    ((): SceneNode | undefined => {
      const hits = findAllNodesByNameContains(container, 'EBnpl');
      for (let i = 0; i < hits.length; i++) {
        const n = hits[i];
        if (n && !n.removed && (n.type === 'INSTANCE' || n.type === 'FRAME' || n.type === 'GROUP')) return n;
      }
      return hits && hits.length ? hits[0] : undefined;
    })();

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

  // Устанавливаем типы для items и скрываем неиспользуемые
  const maxSlots = Math.min(3, allItems.length);
  for (let i = 0; i < maxSlots; i++) {
    const inst = allItems[i];
    if (i < desiredTypes.length) {
      // Показываем и устанавливаем тип
      const t = desiredTypes[i];
      const ok = trySetProperty(inst, ['type', 'Type'], t, '#ShopInfo-Bnpl');
      inst.visible = true;
      Logger.debug(`🧾 [ShopInfo-Bnpl] item[${i}] type=${t}, set=${ok}, visible=true`);
    } else {
      // Скрываем неиспользуемый слот
      inst.visible = false;
      Logger.debug(`🧾 [ShopInfo-Bnpl] item[${i}] скрыт`);
    }
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
