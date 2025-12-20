/**
 * Обработчики доставки и BNPL
 * - handleEDeliveryGroup — блок доставки
 * - handleShopInfoBnpl — BNPL иконки
 * - handleShopInfoDeliveryBnplContainer — контейнер доставки/BNPL
 */

import { Logger } from '../logger';
import { processVariantProperty } from '../property-utils';
import {
  findInstanceByName,
  findFirstNodeByName,
  findFirstTextByPredicate,
  findAllNodesByName,
  findAllNodesByNameContains,
  findNearestNamedAncestor,
  findAllInstances,
  findFirstTextValue,
  safeSetTextNode
} from '../utils/node-search';
import { HandlerContext } from './types';

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

  if (cleaned.indexOf('сплит') !== -1) return 'Split';
  if (cleaned.indexOf('плайт') !== -1) return 'Plait';
  if (cleaned.indexOf('долями') !== -1) return 'Dolyami';
  if (cleaned.indexOf('плати частями') !== -1) return 'Plati Chastyami';
  if (cleaned.indexOf('мокка') !== -1) return 'Mokka';
  if (cleaned.indexOf('подели') !== -1) return 'Podeli';
  if (cleaned.indexOf('мтс') !== -1 && (cleaned.indexOf('пэй') !== -1 || cleaned.indexOf('pay') !== -1)) return 'MTS Pay';
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
  // 1) По названию вложенной графики
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

  // 2) По тексту
  const text = findFirstTextValue(item);
  if (text) return mapBnplLabelToType(text);

  return null;
}

/**
 * Обработка EDeliveryGroup — показать/скрыть и заполнить items
 */
export async function handleEDeliveryGroup(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const itemCount = parseInt(row['#EDeliveryGroup-Count'] || '0', 10);
  const hasDelivery = row['#EDeliveryGroup'] === 'true' && itemCount > 0;
  const isAbroad = row['#EDelivery_abroad'] === 'true';
  
  console.log(`🚚 [EDeliveryGroup] isAbroad=${isAbroad}, hasDelivery=${hasDelivery}, itemCount=${itemCount}`);
  
  const deliveryGroupInstance = findInstanceByName(container, 'EDeliveryGroup');
  
  if (!deliveryGroupInstance) {
    console.log(`🚚 [EDeliveryGroup] Instance NOT FOUND in container`);
    return;
  }
  
  console.log(`🚚 [EDeliveryGroup] Instance FOUND: "${deliveryGroupInstance.name}"`);
  
  // Обработка доставки из-за границы (Crossborder)
  // Если abroad=true — сбрасываем overrides и устанавливаем abroad=true
  if (isAbroad) {
    try {
      console.log(`✈️ [EDeliveryGroup] Applying abroad=true...`);
      
      // Сбрасываем все overrides на компоненте
      deliveryGroupInstance.resetOverrides();
      console.log(`✈️ [EDeliveryGroup] resetOverrides() done`);
      Logger.debug(`   ✈️ [EDeliveryGroup] resetOverrides() выполнен`);
      
      // Логируем доступные свойства
      if (deliveryGroupInstance.componentProperties) {
        const props = deliveryGroupInstance.componentProperties;
        for (const key in props) {
          const prop = props[key];
          if (prop && typeof prop === 'object' && 'type' in prop && prop.type === 'VARIANT') {
            const options = 'options' in prop ? (prop.options as string[]) : [];
            console.log(`✈️ [EDeliveryGroup] Свойство "${key}": опции=[${options.join(', ')}]`);
          }
        }
      }
      
      // Устанавливаем abroad=true
      let abroadSet = processVariantProperty(deliveryGroupInstance, 'abroad=true', '#EDelivery_abroad');
      console.log(`✈️ [EDeliveryGroup] abroad=true result: ${abroadSet}`);
      if (!abroadSet) {
        abroadSet = processVariantProperty(deliveryGroupInstance, 'Abroad=true', '#EDelivery_abroad');
        console.log(`✈️ [EDeliveryGroup] Abroad=true result: ${abroadSet}`);
      }
      
      if (abroadSet) {
        Logger.debug(`   ✈️ [EDeliveryGroup] abroad=true установлен`);
      } else {
        Logger.warn(`   ⚠️ [EDeliveryGroup] abroad property не найден`);
      }
      
      deliveryGroupInstance.visible = true;
      console.log(`✈️ [EDeliveryGroup] visible=true set`);
    } catch (e) {
      console.log(`✈️ [EDeliveryGroup] ERROR:`, e);
      Logger.error(`   ❌ Ошибка обработки abroad для EDeliveryGroup:`, e);
    }
    return; // Для abroad не заполняем items — всё берётся из дефолтного состояния компонента
  }
  
  if (!hasDelivery) {
    try {
      deliveryGroupInstance.visible = false;
      Logger.debug(`   📦 [EDeliveryGroup] visible=false`);
    } catch (e) {
      Logger.error(`   ❌ Ошибка скрытия EDeliveryGroup:`, e);
    }
    return;
  }
  
  try {
    deliveryGroupInstance.visible = true;
  } catch (e) {
    // ignore
  }
  
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
        try {
          const lineContainer = findNearestNamedAncestor(layer, deliveryGroupInstance, 'Line');
          if (lineContainer) {
            try { lineContainer.visible = true; } catch (e) { /* ignore */ }
          }

          if (layer.type === 'TEXT') {
            const textNode = layer as TextNode;
            visibleCounter++;
            const finalValue = visibleCounter > 1 ? withBulletPrefixIfNeeded(itemValue) : itemValue;
            await safeSetTextNode(textNode, finalValue);
            try { textNode.visible = true; } catch (e) { /* ignore */ }
            Logger.debug(`      ✅ Item ${dataIndex}: "${finalValue}"`);
          } else {
            try { layer.visible = true; } catch (e) { /* ignore */ }
          }
        } catch (e) {
          Logger.error(`      ❌ Ошибка заполнения Item ${dataIndex}:`, e);
        }
      } else {
        try {
          const lineContainer = findNearestNamedAncestor(layer, deliveryGroupInstance, 'Line');
          if (lineContainer) lineContainer.visible = false;
          else layer.visible = false;
        } catch (e) { /* ignore */ }
      }
    }

    for (let j = maxSlots; j < itemLayers.length; j++) {
      const layer = itemLayers[j];
      try {
        const lineContainer = findNearestNamedAncestor(layer, deliveryGroupInstance, 'Line');
        if (lineContainer) lineContainer.visible = false;
        else layer.visible = false;
      } catch (e) { /* ignore */ }
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

  for (let i = 0; i < slots.length; i++) {
    try { slots[i].line.visible = false; } catch (e) { /* ignore */ }
  }

  async function showSlot(slotIndex: number, value: string, forceBullet: boolean): Promise<void> {
    const slot = slots[slotIndex];
    const finalValue = forceBullet ? withBulletPrefixIfNeeded(value) : value;
    try { slot.line.visible = true; } catch (e) { /* ignore */ }
    if (slot.text) {
      await safeSetTextNode(slot.text, finalValue);
      try { slot.text.visible = true; } catch (e) { /* ignore */ }
    }
  }

  if (values.length === 1 && bulletSlots.length > 0) {
    const v0 = values[0];
    const v0l = String(v0).toLowerCase();
    if (plainSlots.length > 0 && v0l.indexOf('пвз') !== -1) {
      await showSlot(plainSlots[0].idx, 'Курьер', false);
      await showSlot(bulletSlots[0].idx, v0, true);
    } else {
      await showSlot(bulletSlots[0].idx, v0, true);
    }
  } else if (values.length >= 2 && (plainSlots.length > 0 || bulletSlots.length > 0)) {
    if (plainSlots.length > 0) await showSlot(plainSlots[0].idx, values[0], false);
    else await showSlot(bulletSlots[0].idx, values[0], true);
    if (bulletSlots.length > 0) await showSlot(bulletSlots[0].idx, values[1], true);
    else if (plainSlots.length > 1) await showSlot(plainSlots[1].idx, values[1], true);
  } else if (values.length === 1 && plainSlots.length > 0) {
    await showSlot(plainSlots[0].idx, values[0], false);
  } else if (values.length > 0) {
    for (let i = 0; i < values.length && i < slots.length; i++) {
      await showSlot(i, values[i], i > 0);
    }
  }
}

/**
 * ShopInfo-Bnpl — оставить только нужные BNPL инстансы
 */
export function handleShopInfoBnpl(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;

  const shopCount = parseInt(row['#ShopInfo-Bnpl-Count'] || '0', 10);
  const shopHas = row['#ShopInfo-Bnpl'] === 'true' && shopCount > 0;
  const ebnplCount = parseInt(row['#EBnpl-Count'] || '0', 10);
  const ebnplHas = row['#EBnpl'] === 'true' && ebnplCount > 0;

  const count = shopHas ? shopCount : ebnplCount;
  const has = (shopHas || ebnplHas) && count > 0;

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

  if (!bnplRoot) return;

  if (!has) {
    try { bnplRoot.visible = false; Logger.debug(`   🧾 [ShopInfo-Bnpl] visible=false`); } catch (e) { /* ignore */ }
    return;
  }

  try { bnplRoot.visible = true; } catch (e) { /* ignore */ }

  const desiredTypes: string[] = [];
  for (let i = 1; i <= count && i <= 3; i++) {
    const v = shopHas ? (row[`#ShopInfo-Bnpl-Item-${i}`] || '') : (row[`#EBnpl-Item-${i}`] || '');
    const mapped = mapBnplLabelToType(v);
    if (mapped && desiredTypes.indexOf(mapped) === -1) desiredTypes.push(mapped);
  }

  if (desiredTypes.length === 0) {
    Logger.debug(`   🧾 [ShopInfo-Bnpl] Не удалось распознать типы`);
    return;
  }

  const candidates = findAllInstances(bnplRoot);
  const allItems: InstanceNode[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const inst = candidates[i];
    if ((bnplRoot as SceneNode).id && inst.id === (bnplRoot as SceneNode).id) continue;
    if (!isLikelyBnplItemInstance(inst)) continue;
    allItems.push(inst);
  }

  if (allItems.length === 0) {
    const metaItems = findAllNodesByName(bnplRoot, 'Meta / Fintech').concat(findAllNodesByNameContains(bnplRoot, 'Meta / Fintech'));
    const unique: { [id: string]: SceneNode } = {};
    const metaUnique: SceneNode[] = [];
    for (let i = 0; i < metaItems.length; i++) {
      const n = metaItems[i];
      if (!n || n.removed) continue;
      const id = n.id;
      if (id && !unique[id]) {
        unique[id] = n;
        metaUnique.push(n);
      }
    }

    if (metaUnique.length === 0) {
      Logger.debug(`   🧾 [ShopInfo-Bnpl] Не найдено BNPL items`);
      return;
    }

    for (let i = 0; i < metaUnique.length; i++) {
      try { metaUnique[i].visible = false; } catch (e) { /* ignore */ }
    }

    for (let di = 0; di < desiredTypes.length; di++) {
      const want = desiredTypes[di];
      for (let mi = 0; mi < metaUnique.length; mi++) {
        const item = metaUnique[mi];
        const t = detectBnplTypeFromNode(item);
        if (t === want) {
          try { item.visible = true; } catch (e) { /* ignore */ }
          Logger.debug(`   🧾 [ShopInfo-Bnpl] show(meta) type=${t}`);
          break;
        }
      }
    }
    return;
  }

  const maxSlots = Math.min(3, allItems.length);
  for (let i = 0; i < maxSlots; i++) {
    const inst = allItems[i];
    if (i < desiredTypes.length) {
      const t = desiredTypes[i];
      try { inst.visible = true; } catch (e) { /* ignore */ }
      let ok = processVariantProperty(inst, `type=${t}`, '#ShopInfo-Bnpl');
      if (!ok) ok = processVariantProperty(inst, `Type=${t}`, '#ShopInfo-Bnpl');
      Logger.debug(`   🧾 [ShopInfo-Bnpl] show[${i}] type=${t} set=${ok}`);
    } else {
      try { inst.visible = false; } catch (e) { /* ignore */ }
    }
  }
}

/**
 * Если нет данных ни о доставках, ни о BNPL — скрываем общий контейнер
 */
export function handleShopInfoDeliveryBnplContainer(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;

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
  const hasBnpl = shopHas || ebnplHas;

  const shouldShow = hasDelivery || hasBnpl;

  let target = findFirstNodeByName(container, 'ShopInfo-DeliveryBnplContainer') || 
               findFirstNodeByName(container, '#ShopInfo-DeliveryBnplContainer');
  if (!target) {
    const hits = findAllNodesByNameContains(container, 'ShopInfo-DeliveryBnplContainer');
    if (hits && hits.length) target = hits[0];
  }
  if (!target) return;

  try {
    (target as SceneNode).visible = shouldShow;
    Logger.debug(`   🚚💳 [ShopInfo-DeliveryBnplContainer] visible=${shouldShow}`);
  } catch (e) { /* ignore */ }
  
  // Примечание: EShopItemMeta-UgcLine теперь управляется в handleShopInfoUgcAndEReviewsShopText
  // на основе наличия рейтинга (#ShopInfo-Ugc), а не доставки
}

