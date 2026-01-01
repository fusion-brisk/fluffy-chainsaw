/**
 * Обработчики кнопок
 * - handleMarketCheckoutButton — BUTTON variant на контейнере (устаревший)
 * - handleEButton — EButton view через свойство withButton
 * 
 * Все случаи теперь завязаны на свойство withButton (boolean)
 */

import { Logger } from '../logger';
import { trySetProperty } from '../property-utils';
import { getCachedInstance, getCachedInstanceByNames } from '../utils/instance-cache';
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
  const viewSet = trySetProperty(buttonInstance, ['view', 'View', 'VIEW'], viewValue, '#ButtonView');
  if (viewSet) {
    Logger.debug(`   🔘 [EButton] view=${viewValue}`);
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
 * Определяет, есть ли реальный checkout (по типу или view кнопки)
 */
function hasRealCheckout(buttonType: string, buttonView: string): boolean {
  const bType = (buttonType || '').toLowerCase();
  const bView = (buttonView || '').toLowerCase();
  return bType === 'checkout' || bView.includes('primary');
}

/**
 * Определяет view кнопки по типу сниппета и наличию checkout
 */
function getButtonView(snippetType: string, isCheckout: boolean, isTouch: boolean, defaultView?: string): string {
  if (snippetType === 'EShopItem') {
    // EShopItem: checkout → primaryShort, без checkout → secondary
    return isCheckout ? 'primaryShort' : 'secondary';
  }
  if (snippetType === 'EOfferItem') {
    // EOfferItem: checkout → primaryShort, без checkout → white
    return isCheckout ? 'primaryShort' : 'white';
  }
  if (snippetType === 'ESnippet' || snippetType === 'Snippet') {
    // ESnippet: Touch + checkout → primaryShort, иначе primaryLong
    return (isTouch && isCheckout) ? 'primaryShort' : (defaultView || 'primaryLong');
  }
  return defaultView || 'secondary';
}

/**
 * Обработка BUTTON — устанавливает withButton на контейнере
 * Заменяет старую логику с visible на свойство withButton
 */
export async function handleMarketCheckoutButton(context: HandlerContext): Promise<void> {
  const { container, row } = context;
  if (!container || !row) return;

  const containerName = (container && 'name' in container) ? String(container.name) : '';
  
  // Определяем наличие кнопки
  const buttonType = row['#ButtonType'] ? String(row['#ButtonType']).trim() : '';
  const buttonView = row['#ButtonView'] || '';
  const isCheckout = hasRealCheckout(buttonType, buttonView);
  
  // Для EShopItem/EOfferItem кнопка показывается всегда, но view зависит от checkout
  // Для ESnippet/Snippet — только если есть checkout
  let hasButton: boolean;
  if (containerName === 'EShopItem' || containerName === 'EOfferItem') {
    hasButton = true; // Всегда показываем
  } else if (containerName === 'ESnippet' || containerName === 'Snippet') {
    hasButton = isCheckout; // Только с checkout
  } else {
    hasButton = row['#BUTTON'] === 'true';
  }
  
  if (container.type !== 'INSTANCE' || container.removed) return;
  
  // ВАЖНО: EOfferItem обрабатывается в handleEOfferItem, не перезаписываем!
  if (containerName === 'EOfferItem') return;
  
  const instance = container as InstanceNode;
  
  // Устанавливаем withButton на контейнере
  // Пробуем разные имена: withButton (новое), BUTTON, BUTTONS (старые)
  const withButtonSet = trySetProperty(
    instance, 
    ['withButton', 'BUTTON', 'BUTTONS'], 
    hasButton, 
    '#withButton'
  );
  
  if (withButtonSet) {
    Logger.debug(`   🛒 [BUTTON] withButton=${hasButton} для "${containerName}"`);
  } else {
    Logger.debug(`   ⚠️ [BUTTON] Свойство withButton не найдено в "${containerName}"`);
  }
}

/**
 * Обработка EButton — view кнопки
 * Вся логика visible теперь через withButton на контейнере
 */
export async function handleEButton(context: HandlerContext): Promise<void> {
  const { container, row, instanceCache } = context;
  if (!container || !row) return;
  
  const containerName = (container && 'name' in container) ? String(container.name) : '';
  const snippetType = (containerName === 'EShopItem' || containerName === 'EOfferItem' || containerName === 'ESnippet' || containerName === 'Snippet')
    ? containerName
    : row['#SnippetType'];
  
  const buttonType = row['#ButtonType'] ? String(row['#ButtonType']).trim() : '';
  const buttonViewData = row['#ButtonView'] || '';
  const isCheckout = hasRealCheckout(buttonType, buttonViewData);
  const isTouch = container.type === 'INSTANCE' ? isPlatformTouch(container as SceneNode) : false;
  
  // Определяем hasButton по типу контейнера и Platform
  // Логика: кнопка показывается только если Platform = Desktop или есть checkout
  // Если Platform = Touch — кнопка не показывается (кроме checkout)
  let hasButton: boolean;
  const isDesktop = !isTouch;
  
  if (containerName === 'EShopItem' || containerName === 'EOfferItem') {
    // Для EShopItem/EOfferItem: кнопка если Desktop или checkout
    hasButton = isDesktop || isCheckout;
  } else if (containerName === 'ESnippet' || containerName === 'Snippet') {
    // Для ESnippet: кнопка если (Desktop и есть данные о кнопке) или checkout
    hasButton = (isDesktop && row['#BUTTON'] === 'true') || isCheckout;
  } else {
    hasButton = row['#BUTTON'] === 'true';
  }
  
  // === Устанавливаем withButton на контейнере ===
  // ВАЖНО: EOfferItem обрабатывается в handleEOfferItem, не перезаписываем!
  if (containerName !== 'EOfferItem' && container.type === 'INSTANCE' && !container.removed) {
    const instance = container as InstanceNode;
    
    const withButtonSet = trySetProperty(
      instance,
      ['withButton', 'BUTTON', 'BUTTONS'],
      hasButton,
      '#withButton'
    );
    
    Logger.debug(`   🔘 [EButton] ${containerName}: withButton=${hasButton}, isCheckout=${isCheckout}, isTouch=${isTouch}`);
  }
  
  // Если кнопка не нужна — дальше не обрабатываем view
  if (!hasButton) return;
  
  // === Находим инстанс кнопки и устанавливаем view ===
  let buttonInstance = getCachedInstanceByNames(instanceCache!, ['EButton', 'Ebutton', 'Button']);
  if (!buttonInstance) {
    buttonInstance = getCachedInstance(instanceCache!, 'EButton');
  }
  if (!buttonInstance) {
    buttonInstance = findButtonInstanceLoose(container);
  }
  
  if (!buttonInstance) {
    Logger.debug(`   ⚠️ [EButton] Инстанс кнопки не найден в "${containerName}"`);
    return;
  }
  
<<<<<<< HEAD
  // Определяем и устанавливаем view
  const viewToSet = getButtonView(snippetType || '', isCheckout, isTouch, buttonViewData);
  setButtonView(buttonInstance, viewToSet);
  
  Logger.debug(`   🔘 [EButton] "${buttonInstance.name}" view=${viewToSet}`);
=======
  // Для EShopItem с Platform=Touch: скрывать кнопку и контейнеры если нет checkout
  if (containerName === 'EShopItem' && isTouch) {
    let buttonInstance = findInstanceByName(container, 'EButton');
    if (!buttonInstance) buttonInstance = findInstanceByName(container, 'Ebutton');
    if (!buttonInstance) buttonInstance = findInstanceByName(container, 'Button');
    if (!buttonInstance) buttonInstance = findButtonInstanceLoose(container);
    
    // Ищем контейнеры кнопки: EMarketCheckoutButton-Container и EButton_wrapper
    const buttonContainerNames = [
      'EMarketCheckoutButton-Container',
      'EButton_wrapper',
      'Ebutton_wrapper',
      'EButtonWrapper',
      'ButtonWrapper'
    ];
    
    const buttonContainers: SceneNode[] = [];
    for (const name of buttonContainerNames) {
      const found = findFirstNodeByName(container, name);
      if (found && 'visible' in found) {
        buttonContainers.push(found as SceneNode);
      }
    }
    
    Logger.debug(`   🔘 [EButton] EShopItem Touch: hasRealCheckout=${hasRealCheckout}, containers=${buttonContainers.length}`);
    
    // Скрываем/показываем контейнеры кнопки
    for (const btnContainer of buttonContainers) {
      try {
        btnContainer.visible = hasRealCheckout;
        Logger.debug(`   🔘 [EButton] "${btnContainer.name}" visible=${hasRealCheckout}`);
      } catch (e) {
        Logger.error(`   ❌ [EButton] Ошибка установки visible для "${btnContainer.name}":`, e);
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
    
    handleButtonInstance(foundButton, snippetType || '', hasButton, buttonView, eButtonVisible, buttonType, container as SceneNode);
    return;
  }
  
  // Дефолты для EShopItem/EOfferItem, если ButtonView пуст
  if ((!buttonView || buttonView.trim() === '') && (snippetType === 'EShopItem' || snippetType === 'EOfferItem')) {
    buttonView = snippetType === 'EShopItem' ? 'secondary' : 'white';
  }

  handleButtonInstance(eButtonInstance, snippetType || '', hasButton, buttonView, eButtonVisible, buttonType, container as SceneNode);
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
}
