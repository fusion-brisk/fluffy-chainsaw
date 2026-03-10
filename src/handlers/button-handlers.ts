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
  
  // Определяем платформу из данных или компонента
  const dataPlatform = row['#platform'];
  const componentPlatformTouch = container.type === 'INSTANCE' ? isPlatformTouch(container as SceneNode) : false;
  const isTouch = dataPlatform === 'touch' || componentPlatformTouch;
  
  // Для EShopItem/EOfferItem:
  // - Desktop: кнопка показывается всегда
  // - Touch: кнопка показывается только при checkout
  // Для ESnippet/Snippet — только если есть checkout
  let hasButton: boolean;
  if (containerName === 'EShopItem' || containerName === 'EOfferItem') {
    hasButton = isTouch ? isCheckout : true;
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
  
  // Определяем платформу:
  // 1. Сначала проверяем #platform из данных (приоритет — данные парсинга)
  // 2. Если нет — проверяем Platform property компонента
  const dataPlatform = row['#platform'];
  const componentPlatformTouch = container.type === 'INSTANCE' ? isPlatformTouch(container as SceneNode) : false;
  const isTouch = dataPlatform === 'touch' || componentPlatformTouch;
  
  Logger.debug(`   📱 [EButton] platform: data=${dataPlatform}, component=${componentPlatformTouch ? 'touch' : 'desktop'}, final isTouch=${isTouch}`);
  
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
    
    trySetProperty(
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
  
  // Определяем и устанавливаем view
  const viewToSet = getButtonView(snippetType || '', isCheckout, isTouch, buttonViewData);
  setButtonView(buttonInstance, viewToSet);
  
  Logger.debug(`   🔘 [EButton] "${buttonInstance.name}" view=${viewToSet}`);
}
