/**
 * Обработчики лейблов и барометра
 * - handleBrandLogic — Brand variant
 * - handleELabelGroup — Rating + Barometer
 * - handleEPriceBarometer — Барометр цен
 * - handleEMarketCheckoutLabel — Лейбл чекаута
 */

import { SNIPPET_CONTAINER_NAMES } from '../config';
import { Logger } from '../logger';
import { trySetProperty, trySetVariantProperty } from '../property-utils';
// findTextLayerByName больше не нужен — используем value через component properties
import { getCachedInstance, getCachedInstanceByNames } from '../utils/instance-cache';
import { HandlerContext } from './types';

/**
 * Обработка Brand (если нет значения, выключаем)
 * Brand — BOOLEAN свойство, передаём boolean напрямую
 * 
 * Brand существует ТОЛЬКО в:
 * - EProductSnippet
 * - EShopItem
 * - EOfferItem
 * 
 * НЕ существует в:
 * - ESnippet (у него: Kebab, imageType, Price, BUTTON, Quote, DELIVERY + FINTECH, etc.)
 */
export async function handleBrandLogic(context: HandlerContext): Promise<void> {
  const { container, containerKey: _containerKey, row } = context;
  if (!container || !row) return;

  const containerName = container.name || 'Unknown';
  
  // ESnippet не имеет свойства Brand — пропускаем
  if (containerName === 'ESnippet' || containerName === 'Snippet') {
    Logger.debug(`   🔧 [Brand Logic] Пропускаем ${containerName} (нет свойства Brand)`);
    return;
  }
  
  // Проверяем наличие #Brand в строке (значение не пустое)
  const brandValue = row['#Brand'];
  // Игнорируем Variant Property синтаксис для определения наличия значения
  const isVariantPropertySyntax = brandValue && /^[^=\s]+=.+$/.test(brandValue);
  const hasBrandValue = !!(brandValue && brandValue.trim() !== '' && !isVariantPropertySyntax);

  Logger.debug(`   🔧 [Brand Logic] Brand=${hasBrandValue} для контейнера "${containerName}"`);
  
  try {
    // Устанавливаем Brand на контейнере (BOOLEAN свойство)
    if (container.type === 'INSTANCE' && !container.removed) {
      const containerInstance = container as InstanceNode;
      trySetProperty(containerInstance, ['Brand'], hasBrandValue, '#Brand');
    }
    
    // Также пробуем на дочерних инстансах (для вложенных компонентов)
    if ('children' in container) {
      for (const child of container.children) {
        if (child.type === 'INSTANCE' && !child.removed) {
          const instance = child as InstanceNode;
          // Пропускаем ESnippet и подобные
          const childName = instance.name;
          if (childName !== 'ESnippet' && childName !== 'Snippet' && SNIPPET_CONTAINER_NAMES.includes(childName)) {
            trySetProperty(instance, ['Brand'], hasBrandValue, '#Brand');
          }
        }
      }
    }
  } catch (e) {
    Logger.error(`   ❌ Ошибка обработки Brand для контейнера "${containerName}":`, e);
  }
}

/**
 * Обработка ELabelGroup — Rating и Barometer
 * Свойства: Rating, Checkout, Barometer, Label Order Variant
 * Тип: BOOLEAN — передаём настоящий boolean
 */
export async function handleELabelGroup(context: HandlerContext): Promise<void> {
  const { container, row, instanceCache } = context;
  if (!container || !row) return;

  const eLabelGroupInstance = getCachedInstance(instanceCache!, 'ELabelGroup');

  // Rating (#ProductRating) — BOOLEAN свойство + текстовое value
  const ratingVal = row['#ProductRating'];
  const hasRating = !!(ratingVal && ratingVal.trim() !== '');

  // 1. Устанавливаем withRating (BOOLEAN) на ELabelGroup
  if (eLabelGroupInstance) {
    trySetProperty(eLabelGroupInstance, ['Rating', 'withRating'], hasRating, '#ProductRating');
  }

  // 2. Устанавливаем value на ELabelRating через свойство компонента
  if (hasRating) {
    const eLabelRatingInstance = getCachedInstance(instanceCache!, 'ELabelRating');
    if (eLabelRatingInstance) {
      trySetProperty(eLabelRatingInstance, ['value'], ratingVal.trim(), '#ProductRating');
      Logger.debug(`⭐ [ELabelRating] value="${ratingVal.trim()}"`);
    }
  }

  // Barometer — BOOLEAN свойство
  if (eLabelGroupInstance) {
    const hasBarometer = row['#ELabelGroup_Barometer'] === 'true';
    trySetProperty(eLabelGroupInstance, ['withBarometer', 'Barometer'], hasBarometer, '#ELabelGroup_Barometer');
  }
}

/**
 * Обработка EPriceBarometer — View и isCompact
 * 
 * Логика isCompact:
 * - ESnippet/Snippet: всегда isCompact=false
 * - EProductSnippet2: isCompact=true если width<=182px, иначе false
 * - Остальные: используем значение из парсера
 */
export async function handleEPriceBarometer(context: HandlerContext): Promise<void> {
  const { container, row, instanceCache } = context;
  if (!container || !row) return;

  const hasBarometer = row['#ELabelGroup_Barometer'] === 'true';
  const viewVal = row['#EPriceBarometer_View'];
  const containerName = ('name' in container) ? String(container.name) : '';

  if (hasBarometer && viewVal) {
    const ePriceBarometerInstance = getCachedInstance(instanceCache!, 'EPriceBarometer');
    if (ePriceBarometerInstance) {
      // View (below-market, in-market, above-market)
      trySetProperty(ePriceBarometerInstance, ['View'], viewVal, '#EPriceBarometer_View');

      // isCompact — зависит от типа контейнера
      let isCompact: boolean;

      if (containerName === 'ESnippet' || containerName === 'Snippet') {
        isCompact = false;
        Logger.debug(`   📐 [EPriceBarometer] ESnippet → isCompact=false`);
      } else if (containerName === 'EProductSnippet2') {
        const containerWidth = ('width' in container) ? (container as SceneNode & { width: number }).width : 999;
        isCompact = containerWidth <= 182;
        Logger.debug(`   📐 [EPriceBarometer] EProductSnippet2 width=${containerWidth}px → isCompact=${isCompact}`);
      } else {
        isCompact = row['#EPriceBarometer_isCompact'] === 'true';
      }

      trySetVariantProperty(ePriceBarometerInstance, [`isCompact=${isCompact}`], '#EPriceBarometer_isCompact');
      Logger.debug(`   📐 [EPriceBarometer] isCompact=${isCompact}`);
    }
  }
}

/**
 * Обработка EMarketCheckoutLabel — устанавливает withCheckout на ELabelGroup
 * Свойство withCheckout (boolean) управляет показом лейбла Checkout
 */
export function handleEMarketCheckoutLabel(context: HandlerContext): void {
  const { container, row, instanceCache } = context;
  if (!container || !row) return;

  const hasCheckout = row['#EMarketCheckoutLabel'] === 'true';
  
  // Ищем ELabelGroup — родительский компонент с withCheckout
  const labelGroupInstance = getCachedInstanceByNames(instanceCache!, ['ELabelGroup', 'LabelGroup']);
  
  if (labelGroupInstance) {
    const set = trySetProperty(labelGroupInstance, ['withCheckout'], hasCheckout, '#EMarketCheckoutLabel');
    Logger.debug(`   🏷️ [EMarketCheckoutLabel] withCheckout=${hasCheckout}, result=${set}`);
  } else {
    // Fallback: ищем сам EMarketCheckoutLabel и пробуем visible (старое поведение)
    const labelInstance = getCachedInstance(instanceCache!, 'EMarketCheckoutLabel');
    if (labelInstance) {
      Logger.debug(`   🏷️ [EMarketCheckoutLabel] ELabelGroup не найден, пропускаем`);
    }
  }
}
