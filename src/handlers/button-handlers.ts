/**
 * Обработчики кнопок
 * - handleMarketCheckoutButton — BUTTON variant на контейнере
 * - handleEButton — EButton view и visible
 */

import { Logger } from '../logger';
import { processVariantProperty, processStringProperty } from '../property-utils';
import { findInstanceByName, findFirstNodeByName } from '../utils/node-search';
import { HandlerContext } from './types';

/**
 * Поиск кнопки по эвристике (имя содержит "Button")
 */
function findButtonInstanceLoose(container: BaseNode): InstanceNode | null {
  const queue: BaseNode[] = [container];
  while (queue.length) {
    const node = queue.shift();
    if (!node) break;
    if (node.type === 'INSTANCE' && !node.removed) {
      const inst = node as InstanceNode;
      const n = (inst.name || '').toLowerCase();
      if (n.includes('button')) {
        const props = inst.componentProperties || {};
        for (const key in props) {
          if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
          if (key === 'view' || key.toLowerCase().startsWith('view#')) {
            return inst;
          }
        }
        // Даже без view, иногда кнопка управляется другими пропсами — всё равно вернём как fallback
        return inst;
      }
    }
    if ('children' in node && (node as BaseNode & ChildrenMixin).children) {
      const kids = (node as BaseNode & ChildrenMixin).children as readonly BaseNode[];
      for (const k of kids) queue.push(k);
    }
  }
  return null;
}

/**
 * Устанавливает view property для кнопки
 */
function setButtonView(buttonInstance: InstanceNode, viewValue: string): void {
  const viewVariants = [
    `view=${viewValue}`,
    `View=${viewValue}`,
    `VIEW=${viewValue}`
  ];
  
  let viewSet = false;
  for (const variant of viewVariants) {
    viewSet = processVariantProperty(buttonInstance, variant, '#ButtonView');
    if (viewSet) {
      Logger.debug(`   🔘 [EButton] Установлен ${variant}`);
      break;
    }
  }
  
  // Fallback: пробуем как String Property
  if (!viewSet) {
    processStringProperty(buttonInstance, 'view', viewValue, '#ButtonView');
    Logger.debug(`   🔘 [EButton] Установлен view="${viewValue}" (String Property)`);
  }
}

/**
 * Проверяет, установлено ли у контейнера свойство Platform=Touch
 */
function isPlatformTouch(container: SceneNode): boolean {
  if (container.type !== 'INSTANCE') return false;
  
  const instance = container as InstanceNode;
  const props = instance.componentProperties || {};
  
  for (const key in props) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
    const propName = key.split('#')[0].toLowerCase();
    if (propName === 'platform') {
      const value = props[key];
      if (value && typeof value === 'object' && 'value' in value) {
        return String(value.value).toLowerCase() === 'touch';
      }
    }
  }
  return false;
}

/**
 * Вспомогательная функция для обработки найденного инстанса кнопки
 */
function handleButtonInstance(
  buttonInstance: InstanceNode, 
  snippetType: string, 
  hasButton: boolean, 
  buttonView: string | undefined,
  eButtonVisible: string | undefined,
  buttonType?: string,
  container?: SceneNode
): void {
  Logger.debug(`   🔘 [EButton] Найден инстанс "${buttonInstance.name}" в ${snippetType}`);
  
  // === Логика для ESnippet/Organic ===
  if (snippetType === 'Organic_withOfferInfo' || snippetType === 'Organic') {
    const shouldBeVisible = eButtonVisible === 'true' || hasButton;
    
    try {
      buttonInstance.visible = shouldBeVisible;
      Logger.debug(`   🔘 [EButton] visible=${shouldBeVisible} для ESnippet`);
    } catch (e) {
      Logger.error(`   ❌ [EButton] Ошибка установки visible:`, e);
    }
    
    if (shouldBeVisible && buttonView) {
      setButtonView(buttonInstance, buttonView);
    }
    return;
  }
  
  // === Логика для EOfferItem и EShopItem ===
  if (snippetType === 'EOfferItem' || snippetType === 'EShopItem') {
    try {
      buttonInstance.visible = true;
      Logger.debug(`   🔘 [EButton] visible=true для ${snippetType}`);
    } catch (e) {
      Logger.error(`   ❌ [EButton] Ошибка установки visible:`, e);
    }
    
    const normalized = (buttonView || '').trim();
    const normalizedType = (buttonType || '').trim();
    const isCheckout =
      normalizedType === 'checkout' ||
      normalized === 'primaryLong' ||
      normalized === 'primaryShort' ||
      /^primary/i.test(normalized);
    
    let desiredView: string;
    if (snippetType === 'EShopItem') {
      // EShopItem Desktop: checkout → primaryShort, без checkout → secondary
      desiredView = isCheckout ? 'primaryShort' : 'secondary';
    } else {
      // EOfferItem: checkout → primaryShort, без checkout → white
      desiredView = isCheckout ? 'primaryShort' : 'white';
    }
    
    setButtonView(buttonInstance, desiredView);
    return;
  }
  
  // === Логика для EProductSnippet2 ===
  if (snippetType === 'EProductSnippet2') {
    if (hasButton && buttonView) {
      setButtonView(buttonInstance, buttonView);
    }
  }
}

/**
 * Обработка BUTTON — кнопка "Купить в 1 клик" (MarketCheckout)
 * Устанавливает Variant Property BUTTON=true/false на контейнере сниппета
 */
export function handleMarketCheckoutButton(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;

  // Для EShopItem и EOfferItem кнопка должна быть ВСЕГДА включена
  const containerName = (container && 'name' in container) ? String(container.name) : '';
  const isAlwaysOnContainer = containerName === 'EShopItem' || containerName === 'EOfferItem';
  const hasButton = isAlwaysOnContainer ? true : (row['#BUTTON'] === 'true');
  
  // Устанавливаем BUTTON variant property на контейнере
  if (container.type === 'INSTANCE' && !container.removed) {
    const instance = container as InstanceNode;
    
    let buttonSet = processVariantProperty(instance, `BUTTON=${hasButton}`, '#BUTTON');
    if (!buttonSet) buttonSet = processVariantProperty(instance, `Button=${hasButton}`, '#BUTTON');
    if (!buttonSet) buttonSet = processVariantProperty(instance, `button=${hasButton}`, '#BUTTON');
    
    if (buttonSet) {
      Logger.debug(`   🛒 [BUTTON] BUTTON=${hasButton} для контейнера "${container.name}"`);
    }
  }
  
  // Ищем вложенные инстансы с BUTTON property
  if ('children' in container) {
    for (const child of container.children) {
      if (child.type === 'INSTANCE' && !child.removed) {
        const childInstance = child as InstanceNode;
        
        const props = childInstance.componentProperties;
        for (const propKey in props) {
          if (propKey.toLowerCase().includes('button')) {
            try {
              const propName = propKey.split('#')[0];
              processVariantProperty(childInstance, `${propName}=${hasButton}`, '#BUTTON');
              Logger.debug(`   🛒 [BUTTON] ${propName}=${hasButton} для инстанса "${childInstance.name}"`);
            } catch (e) {
              // ignore
            }
          }
        }
      }
    }
  }
}

/**
 * Обработка EButton — кнопка внутри сниппета (view и visible)
 * 
 * Логика по типам сниппетов:
 * - EOfferItem: красная кнопка → view='primaryShort', белая → view='white'
 * - EShopItem: checkout → view='primaryLong', дефолтная → view='secondary'
 * - ESnippet/Organic: кнопка есть → view='primaryShort' + visible=true, нет → visible=false
 */
export function handleEButton(context: HandlerContext): void {
  const { container, row } = context;
  if (!container || !row) return;
  
  // Для EShopItem/EOfferItem ориентируемся на ТИП КОНТЕЙНЕРА в Figma
  const containerName = (container && 'name' in container) ? String(container.name) : '';
  const isESnippetContainer = containerName === 'ESnippet' || containerName === 'Snippet';
  const snippetType = (containerName === 'EShopItem' || containerName === 'EOfferItem')
    ? containerName
    : row['#SnippetType'];
  
  const hasButton = row['#BUTTON'] === 'true';
  let buttonView = row['#ButtonView'];
  const eButtonVisible = row['#EButton_visible'];
  const buttonType = row['#ButtonType'] ? String(row['#ButtonType']).trim() : '';
  
  // Проверяем Platform=Touch для контейнера
  const isTouch = container.type === 'INSTANCE' ? isPlatformTouch(container as SceneNode) : false;
  
  // Определяем реальный checkout (не по #BUTTON, а по реальным признакам)
  const bType = (buttonType || '').toLowerCase();
  const bView = (buttonView || '').toLowerCase();
  const hasRealCheckout = bType === 'checkout' || bView.includes('primary');
  
  // Для ESnippet/Snippet: кнопка видна ТОЛЬКО если есть реальный checkout
  if (isESnippetContainer) {
    // Ищем кнопку: сначала точные имена, потом эвристически
    let buttonInstance = findInstanceByName(container, 'EButton');
    if (!buttonInstance) buttonInstance = findInstanceByName(container, 'Ebutton');
    if (!buttonInstance) buttonInstance = findInstanceByName(container, 'Button');
    if (!buttonInstance) buttonInstance = findButtonInstanceLoose(container);
    
    if (buttonInstance) {
      const snippetTypeData = row['#SnippetType'] || '';
      let shouldBeVisible = false;
      
      if (snippetTypeData === 'Organic_withOfferInfo' || snippetTypeData === 'Organic') {
        // Для Organic используем стандартную логику
        shouldBeVisible = hasButton;
      } else {
        // Для EShopItem/EOfferItem/EProductSnippet2 проверяем реальный checkout
        shouldBeVisible = hasRealCheckout;
      }
      
      Logger.debug(`   🔘 [EButton] ESnippet: snippetType=${snippetTypeData}, Platform=${isTouch ? 'Touch' : 'Desktop'}, hasRealCheckout=${hasRealCheckout}`);
      
      try {
        buttonInstance.visible = shouldBeVisible;
        Logger.debug(`   🔘 [EButton] visible=${shouldBeVisible} для "${buttonInstance.name}"`);
      } catch (e) {
        Logger.error(`   ❌ [EButton] Ошибка установки visible:`, e);
      }
      
      // Устанавливаем view: для Touch + checkout → primaryShort
      if (shouldBeVisible) {
        const viewToSet = (isTouch && hasRealCheckout) ? 'primaryShort' : (buttonView || 'primaryLong');
        setButtonView(buttonInstance, viewToSet);
        Logger.debug(`   🔘 [EButton] view=${viewToSet}`);
      }
    } else {
      Logger.debug(`   ⚠️ [EButton] Кнопка не найдена в ESnippet "${container.name}"`);
    }
    return;
  }
  
  // Для EShopItem с Platform=Touch: скрывать кнопку и контейнер если нет checkout
  if (containerName === 'EShopItem' && isTouch) {
    let buttonInstance = findInstanceByName(container, 'EButton');
    if (!buttonInstance) buttonInstance = findInstanceByName(container, 'Ebutton');
    if (!buttonInstance) buttonInstance = findInstanceByName(container, 'Button');
    if (!buttonInstance) buttonInstance = findButtonInstanceLoose(container);
    
    // Ищем контейнер кнопки EMarketCheckoutButton-Container
    const buttonContainer = findFirstNodeByName(container, 'EMarketCheckoutButton-Container');
    
    Logger.debug(`   🔘 [EButton] EShopItem Touch: hasRealCheckout=${hasRealCheckout}`);
    
    // Скрываем/показываем контейнер кнопки
    if (buttonContainer && 'visible' in buttonContainer) {
      try {
        (buttonContainer as SceneNode).visible = hasRealCheckout;
        Logger.debug(`   🔘 [EButton] EMarketCheckoutButton-Container visible=${hasRealCheckout}`);
      } catch (e) {
        Logger.error(`   ❌ [EButton] Ошибка установки visible для контейнера:`, e);
      }
    }
    
    // Скрываем/показываем саму кнопку
    if (buttonInstance) {
      try {
        buttonInstance.visible = hasRealCheckout;
        Logger.debug(`   🔘 [EButton] visible=${hasRealCheckout}`);
      } catch (e) {
        Logger.error(`   ❌ [EButton] Ошибка установки visible:`, e);
      }
      
      // С checkout → primaryShort
      if (hasRealCheckout) {
        setButtonView(buttonInstance, 'primaryShort');
      }
    }
    return;
  }
  
  // Находим EButton внутри контейнера
  const eButtonInstance = findInstanceByName(container, 'EButton');
  
  if (!eButtonInstance) {
    // Пробуем альтернативные имена
    const altNames = ['Button', 'MarketButton', 'CheckoutButton'];
    let foundButton: InstanceNode | null = null;
    for (const name of altNames) {
      foundButton = findInstanceByName(container, name);
      if (foundButton) break;
    }
    
    // Fallback: ищем любую кнопку по эвристике
    if (!foundButton && (snippetType === 'EShopItem' || snippetType === 'EOfferItem')) {
      foundButton = findButtonInstanceLoose(container);
    }
    
    if (!foundButton) {
      if (hasButton && (snippetType === 'Organic_withOfferInfo' || snippetType === 'Organic')) {
        Logger.debug(`   ⚠️ [EButton] EButton не найден в контейнере "${container.name}"`);
      }
      return;
    }
    
    handleButtonInstance(foundButton, snippetType, hasButton, buttonView, eButtonVisible, buttonType, container as SceneNode);
    return;
  }
  
  // Дефолты для EShopItem/EOfferItem, если ButtonView пуст
  if ((!buttonView || buttonView.trim() === '') && (snippetType === 'EShopItem' || snippetType === 'EOfferItem')) {
    buttonView = snippetType === 'EShopItem' ? 'secondary' : 'white';
  }

  handleButtonInstance(eButtonInstance, snippetType, hasButton, buttonView, eButtonVisible, buttonType, container as SceneNode);
}
