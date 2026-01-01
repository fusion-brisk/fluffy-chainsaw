// Price extraction utilities

import { Logger } from '../logger';
import {
  PRICE_DIGITS_REGEX,
  CURRENCY_RUB_REGEX,
  CURRENCY_USD_REGEX,
  CURRENCY_EUR_REGEX
} from './regex';

export interface PriceResult {
  price: string;
  currency: string;
  oldPrice?: string;
}

// Интерфейс для внутреннего хранения информации о цене
interface PriceInfo {
  value: number;
  currency: string;
  text: string;
  element: Element;
  priceGroupId: string | null; // ID родительского EPriceGroup для контекстной проверки
}

// Находит родительский EPriceGroup для элемента цены
function findPriceGroupParent(el: Element): Element | null {
  let parent: Element | null = el.parentElement;
  let depth = 0;
  while (parent && depth < 10) {
    const parentClasses = parent.className || '';
    if (parentClasses.includes('EPriceGroup') && !parentClasses.includes('EPriceGroup-')) {
      return parent;
    }
    parent = parent.parentElement;
    depth++;
  }
  return null;
}

// Генерирует уникальный ID для элемента (для сравнения контекста)
function getElementId(el: Element | null): string | null {
  if (!el) return null;
  // Используем комбинацию className + позиция в DOM
  return el.className + '_' + Array.from(el.parentElement?.children || []).indexOf(el);
}

// Извлекает цены из контейнера
export function extractPrices(container: Element): PriceResult {
  // Ищем только элементы с ТОЧНЫМ классом EPrice-Value (значение цены)
  // НЕ используем [class*="EPriceGroup-Price"] — он захватывает родительский контейнер с лишним текстом!
  const priceElements = container.querySelectorAll('.EPrice-Value');
  
  // Разделяем на текущие и старые цены по классу EPrice_view_old
  const currentPrices: PriceInfo[] = [];
  const oldPrices: PriceInfo[] = [];
  
  for (const priceEl of priceElements) {
    // Пропускаем элементы скидок и лейблов
    const classes = priceEl.className || '';
    if (classes.includes('LabelDiscount') || classes.includes('Discount') || classes.includes('Label_')) {
      continue;
    }
    
    const text = priceEl.textContent?.trim() || '';
    const digits = text.replace(PRICE_DIGITS_REGEX, '');
    if (digits.length >= 3) {
      const value = parseInt(digits, 10);
      const currency = CURRENCY_RUB_REGEX.test(text) ? '₽' : (CURRENCY_USD_REGEX.test(text) ? '$' : (CURRENCY_EUR_REGEX.test(text) ? '€' : ''));
      
      // Находим родительский EPriceGroup для контекстной проверки
      const priceGroup = findPriceGroupParent(priceEl);
      const priceGroupId = getElementId(priceGroup);
      
      // Проверяем, является ли это старой ценой (по классу родителя или прародителя)
      let parent: Element | null = priceEl.parentElement;
      let isOldPrice = false;
      let depth = 0;
      while (parent && depth < 5) {
        const parentClasses = parent.className || '';
        if (parentClasses.includes('view_old') || parentClasses.includes('EPrice_view_old')) {
          isOldPrice = true;
          break;
        }
        parent = parent.parentElement;
        depth++;
      }
      
      const priceInfo: PriceInfo = { value, currency, text, element: priceEl, priceGroupId };
      
      if (isOldPrice) {
        oldPrices.push(priceInfo);
      } else {
        currentPrices.push(priceInfo);
      }
    }
  }
  
  // Берём минимальную текущую цену
  if (currentPrices.length > 0) {
    const sortedCurrent = currentPrices.sort((a, b) => a.value - b.value);
    const currentPrice = sortedCurrent[0];
    const result: PriceResult = {
      price: currentPrice.value.toString(),
      currency: currentPrice.currency === 'руб.' ? '₽' : currentPrice.currency
    };
    
    // Если есть явные старые цены (по классу), используем их
    if (oldPrices.length > 0) {
      // УЛУЧШЕНИЕ: предпочитаем старую цену из того же EPriceGroup
      const sameGroupOldPrices = oldPrices.filter(p => p.priceGroupId === currentPrice.priceGroupId);
      const relevantOldPrices = sameGroupOldPrices.length > 0 ? sameGroupOldPrices : oldPrices;
      const sortedOld = relevantOldPrices.sort((a, b) => b.value - a.value);
      result.oldPrice = sortedOld[0].value.toString();
    } else if (sortedCurrent.length > 1) {
      // УЛУЧШЕНИЕ: Fallback с проверкой контекста
      // Ищем вторую цену ТОЛЬКО из того же EPriceGroup
      const sameGroupPrices = sortedCurrent.filter(p => p.priceGroupId === currentPrice.priceGroupId);
      
      if (sameGroupPrices.length > 1) {
        const secondPrice = sameGroupPrices[1];
        // Проверяем разницу в 5% и что цены из одного контекста
        if (secondPrice.value > currentPrice.value * 1.05) {
          result.oldPrice = secondPrice.value.toString();
          Logger.debug(`⚠️ [extractPrices] Использован fallback: oldPrice=${secondPrice.value} (из того же EPriceGroup)`);
        }
      }
      // Если цены из разных EPriceGroup — НЕ используем fallback,
      // это скорее всего цены разных магазинов
    }
    
    return result;
  }
  
  return { price: '', currency: '' };
}

// Функция для форматирования цены с математическим пробелом (U+2009) для тысяч
export function formatPriceWithThinSpace(priceStr: string): string {
  if (!priceStr || priceStr.length < 4) return priceStr;
  // Добавляем математический пробел каждые 3 цифры справа налево
  return priceStr.replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
}

