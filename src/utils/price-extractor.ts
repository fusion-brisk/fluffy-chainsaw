// Price extraction utilities

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

// Извлекает цены из контейнера
export function extractPrices(container: Element): PriceResult {
  const priceElements = container.querySelectorAll('.EProductSnippet2-Price, [class*="EProductSnippet2-Price"], .Price, [class*="Price"], [class*="price"]');
  const prices: { value: number; currency: string; text: string }[] = [];
  
  for (const priceEl of priceElements) {
    const text = priceEl.textContent?.trim() || '';
    const digits = text.replace(PRICE_DIGITS_REGEX, '');
    if (digits.length >= 3) {
      const value = parseInt(digits, 10);
      const currency = CURRENCY_RUB_REGEX.test(text) ? '₽' : (CURRENCY_USD_REGEX.test(text) ? '$' : (CURRENCY_EUR_REGEX.test(text) ? '€' : ''));
      prices.push({ value, currency, text });
    }
  }
  
  if (prices.length > 0) {
    const sortedPrices = prices.sort((a, b) => a.value - b.value);
    const currentPrice = sortedPrices[0];
    const result: PriceResult = {
      price: currentPrice.value.toString(),
      currency: currentPrice.currency === 'руб.' ? '₽' : currentPrice.currency
    };
    
    if (sortedPrices.length > 1 && sortedPrices[1].value > currentPrice.value * 1.1) {
      result.oldPrice = sortedPrices[1].value.toString();
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

