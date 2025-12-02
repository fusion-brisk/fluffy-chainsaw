const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('examples/iphone17.html', 'utf-8');
const dom = new JSDOM(html);
const doc = dom.window.document;

// Анализируем первый Organic_withOfferInfo со скидкой
const organic = doc.querySelector('[class*="Organic_withOfferInfo"]');
if (organic) {
  console.log('=== Структура Organic_withOfferInfo ===\n');
  
  // Ищем элементы с ценами
  const priceElements = organic.querySelectorAll('[class*="Price"], [class*="price"]');
  console.log(`Найдено элементов с "Price" в классе: ${priceElements.length}`);
  priceElements.forEach((el, i) => {
    const text = el.textContent.trim().substring(0, 100).replace(/\s+/g, ' ');
    console.log(`  [${i}] ${el.className.substring(0, 60)}`);
    console.log(`      text: "${text}"`);
  });
  
  // Ищем элементы со скидкой
  console.log('\nЭлементы с "Discount"/"discount":');
  const discountElements = organic.querySelectorAll('[class*="Discount"], [class*="discount"]');
  discountElements.forEach((el, i) => {
    console.log(`  [${i}] ${el.className.substring(0, 60)}: "${el.textContent.trim().substring(0, 50)}"`);
  });
  
  // EPriceGroup-Pair
  const pair = organic.querySelector('.EPriceGroup-Pair, [class*="EPriceGroup-Pair"]');
  console.log(`\nEPriceGroup-Pair: ${pair ? 'НАЙДЕН' : 'НЕТ'}`);
  
  // EPrice_view_old
  const oldPrice = organic.querySelector('.EPrice_view_old, [class*="EPrice_view_old"]');
  console.log(`EPrice_view_old: ${oldPrice ? 'НАЙДЕН - ' + oldPrice.textContent.trim().substring(0, 30) : 'НЕТ'}`);
  
  // Offer-Price
  const offerPrice = organic.querySelector('.Organic-OfferPrice, [class*="Organic-OfferPrice"], [class*="OfferPrice"]');
  console.log(`Organic-OfferPrice: ${offerPrice ? 'НАЙДЕН' : 'НЕТ'}`);
  if (offerPrice) {
    console.log(`  HTML: ${offerPrice.outerHTML.substring(0, 300)}...`);
  }
}

// Анализируем EProductSnippet2 со скидкой
console.log('\n\n=== Структура EProductSnippet2 ===\n');
const snippet = doc.querySelector('[class*="EProductSnippet2"]');
if (snippet) {
  const pair = snippet.querySelector('.EPriceGroup-Pair, [class*="EPriceGroup-Pair"]');
  console.log(`EPriceGroup-Pair: ${pair ? 'НАЙДЕН' : 'НЕТ'}`);
  
  if (pair) {
    console.log(`\nСодержимое EPriceGroup-Pair:`);
    const allElements = pair.querySelectorAll('*');
    allElements.forEach((el, i) => {
      if (el.className && el.className.length > 0) {
        const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 
          ? el.textContent.trim() : '';
        if (text) {
          console.log(`  ${el.className.substring(0, 50)}: "${text}"`);
        }
      }
    });
  }
  
  // Discount
  const discount = snippet.querySelector('.LabelDiscount .Label-Content');
  console.log(`\nLabelDiscount .Label-Content: ${discount ? discount.textContent.trim() : 'НЕТ'}`);
  
  // OldPrice
  const oldPriceEl = snippet.querySelector('.EPrice_view_old .EPrice-Value');
  console.log(`EPrice_view_old .EPrice-Value: ${oldPriceEl ? oldPriceEl.textContent.trim() : 'НЕТ'}`);
  
  // Current Price
  const currentPriceEl = snippet.querySelector('.EPrice_size_l:not(.EPrice_view_old) .EPrice-Value');
  console.log(`EPrice_size_l (not old) .EPrice-Value: ${currentPriceEl ? currentPriceEl.textContent.trim() : 'НЕТ'}`);
}
