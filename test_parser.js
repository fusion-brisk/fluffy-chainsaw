const fs = require('fs');
const { JSDOM } = require('jsdom');

// Загружаем HTML
const html = fs.readFileSync('examples/iphone17.html', 'utf-8');
const dom = new JSDOM(html);
const doc = dom.window.document;

// Импортируем regex паттерны
const PRICE_DIGITS_REGEX = /[^0-9]/g;
const CURRENCY_RUB_REGEX = /₽|руб/i;
const DISCOUNT_VALUE_REGEX = /([\d\s\u2009\u00A0,]+)/;

// Находим контейнеры
const selectors = [
  '[class*="Organic_withOfferInfo"]',
  '[class*="EProductSnippet2"]',
  '[class*="EShopItem"]'
];

const containers = [];
selectors.forEach(sel => {
  doc.querySelectorAll(sel).forEach(el => {
    // Фильтруем вложенные
    let isNested = false;
    containers.forEach(c => { if (c.contains(el) && c !== el) isNested = true; });
    if (!isNested) {
      // Удаляем предыдущие если вложены в текущий
      for (let i = containers.length - 1; i >= 0; i--) {
        if (el.contains(containers[i])) containers.splice(i, 1);
      }
      containers.push(el);
    }
  });
});

console.log(`\n=== Тест парсера: ${containers.length} сниппетов ===\n`);

// Тестируем извлечение цен
containers.slice(0, 10).forEach((container, idx) => {
  const type = container.className.includes('EProductSnippet2') ? 'EProductSnippet2' :
               container.className.includes('Organic_withOfferInfo') ? 'Organic' : 'Other';
  
  // Title
  const titleEl = container.querySelector('.OrganicTitle, [class*="OrganicTitle"], .EProductSnippet2-Title a, [class*="EProductSnippet2-Title"] a');
  const title = titleEl ? titleEl.textContent.trim().substring(0, 50) : '(нет)';
  
  // EPriceGroup-Pair (для скидок)
  const priceGroupPair = container.querySelector('.EPriceGroup-Pair, [class*="EPriceGroup-Pair"]');
  
  // Текущая цена
  let currentPrice = '';
  let oldPrice = '';
  let discount = '';
  
  if (priceGroupPair) {
    // Логика EPriceGroup-Pair
    // Текущая цена: .EPriceGroup-Price:not(.EPrice_view_old) .EPrice-Value
    const currentPriceEl = container.querySelector('.EPrice_size_l:not(.EPrice_view_old) .EPrice-Value, .EPriceGroup-Price:not(.EPrice_view_old) .EPrice-Value');
    if (currentPriceEl) {
      currentPrice = currentPriceEl.textContent.trim().replace(PRICE_DIGITS_REGEX, '');
    }
    
    // Старая цена: ТОЛЬКО .EPrice-Value внутри .EPrice_view_old
    const oldPriceEl = container.querySelector('.EPrice_view_old .EPrice-Value');
    if (oldPriceEl) {
      oldPrice = oldPriceEl.textContent.trim().replace(PRICE_DIGITS_REGEX, '');
    }
    
    // Скидка: .LabelDiscount .Label-Content
    const discountEl = container.querySelector('.LabelDiscount .Label-Content, .EPriceGroup-LabelDiscount .Label-Content');
    if (discountEl) {
      const discountText = discountEl.textContent.trim();
      const match = discountText.match(DISCOUNT_VALUE_REGEX);
      if (match) {
        discount = `–${match[1].trim()}%`;
      }
    }
  } else {
    // Обычная логика
    const priceEl = container.querySelector('.EPrice-Value');
    if (priceEl) {
      currentPrice = priceEl.textContent.trim().replace(PRICE_DIGITS_REGEX, '');
    }
  }
  
  // Rating - исключаем LabelDiscount!
  const ratingEl = container.querySelector('.ELabelRating:not(.LabelDiscount) .Label-Content');
  let rating = '';
  if (ratingEl) {
    const ratingText = ratingEl.textContent.trim();
    // Извлекаем число от 0 до 5
    const ratingMatch = ratingText.match(/(\d[,.]?\d?)/);
    if (ratingMatch) {
      rating = ratingMatch[1].replace(',', '.');
    }
  }
  
  console.log(`[${idx + 1}] ${type}: ${title}...`);
  console.log(`    💰 Price: ${currentPrice || '(нет)'}, OldPrice: ${oldPrice || '(нет)'}, Discount: ${discount || '(нет)'}`);
  console.log(`    ⭐ Rating: ${rating || '(нет)'}`);
  console.log('');
});
