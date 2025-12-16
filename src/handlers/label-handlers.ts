/**
 * Обработчики лейблов и барометра
 * - handleBrandLogic — Brand variant
 * - handleELabelGroup — Rating + Barometer
 * - handleEPriceBarometer — Барометр цен
 * - handleEMarketCheckoutLabel — Лейбл чекаута
 */

import { COMPONENT_CONFIG, SNIPPET_CONTAINER_NAMES } from '../config';
import { Logger } from '../logger';
import { processVariantProperty, processStringProperty, processVariantPropertyRecursive } from '../property-utils';
import { findInstanceByName, findTextLayerByName } from '../utils/node-search';
import { HandlerContext } from './types';

/**
 * Обработка Brand (если нет значения, выключаем)
 */
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

/**
 * Обработка ELabelGroup — Rating и Barometer variants
 */
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

/**
 * Обработка EPriceBarometer — View и isCompact
 * 
 * Логика isCompact:
 * - ESnippet/Snippet: всегда isCompact=false
 * - EProductSnippet2: isCompact=true если width<=182px, иначе false
 * - Остальные: используем значение из парсера
 */
export function handleEPriceBarometer(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;

  const config = COMPONENT_CONFIG.EPriceBarometer;
  const barometerVal = row['#ELabelGroup_Barometer']; // Зависимость от поля ELabelGroup
  const hasBarometer = barometerVal === 'true';
  const viewVal = row[config.properties.view.dataField];
  const containerName = ('name' in container) ? String(container.name) : '';
  
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
      
      // Определяем isCompact на основе типа контейнера
      let isCompact: boolean;
      
      if (containerName === 'ESnippet' || containerName === 'Snippet') {
        // ESnippet: всегда isCompact=false
        isCompact = false;
        Logger.debug(`   📐 [EPriceBarometer] ESnippet → isCompact=false`);
      } else if (containerName === 'EProductSnippet2') {
        // EProductSnippet2: проверяем ширину контейнера
        const containerWidth = ('width' in container) ? (container as SceneNode & { width: number }).width : 999;
        isCompact = containerWidth <= 182;
        Logger.debug(`   📐 [EPriceBarometer] EProductSnippet2 width=${containerWidth}px → isCompact=${isCompact}`);
      } else {
        // Остальные: используем значение из парсера
        const isCompactVal = row[config.properties.isCompact.dataField];
        isCompact = isCompactVal === 'true';
      }
      
      processVariantProperty(
        ePriceBarometerInstance,
        `${config.properties.isCompact.variantName}=${isCompact}`,
        config.properties.isCompact.dataField
      );
      Logger.debug(`   📐 [EPriceBarometer] isCompact=${isCompact}`);
    }
  }
}

/**
 * Обработка EMarketCheckoutLabel — показать/скрыть в зависимости от наличия в HTML
 */
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
