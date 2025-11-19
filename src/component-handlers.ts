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
  processVariantProperty(
    ePriceGroupInstance, 
    `${config.properties.discount.variantName}=${hasDiscount}`, 
    config.properties.discount.dataField
  );
  
  // Old Price
  const oldPriceVal = row[config.properties.oldPrice.dataField];
  const hasOldPrice = oldPriceVal === 'true';
  
  if (hasOldPrice) {
    // Пробуем разные варианты названия свойства
    if (!processVariantProperty(ePriceGroupInstance, 'Old Price=true', config.properties.oldPrice.dataField)) {
      if (!processVariantProperty(ePriceGroupInstance, 'OldPrice=true', config.properties.oldPrice.dataField)) {
        processVariantProperty(ePriceGroupInstance, 'Old_Price=true', config.properties.oldPrice.dataField);
      }
    }
  } else {
    // Пробуем разные варианты для false
    let oldPriceSet = false;
    oldPriceSet = processVariantProperty(ePriceGroupInstance, 'Old Price=false', config.properties.oldPrice.dataField) || oldPriceSet;
    if (!oldPriceSet) oldPriceSet = processVariantProperty(ePriceGroupInstance, 'OldPrice=false', config.properties.oldPrice.dataField) || oldPriceSet;
    if (!oldPriceSet) oldPriceSet = processVariantProperty(ePriceGroupInstance, 'Old_Price=false', config.properties.oldPrice.dataField) || oldPriceSet;
    if (!oldPriceSet) oldPriceSet = processVariantProperty(ePriceGroupInstance, 'old price=false', config.properties.oldPrice.dataField) || oldPriceSet;
    if (!oldPriceSet) processVariantProperty(ePriceGroupInstance, 'oldprice=false', config.properties.oldPrice.dataField);
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

