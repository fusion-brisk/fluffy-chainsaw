const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('examples/iphone17.html', 'utf-8');
const dom = new JSDOM(html);
const doc = dom.window.document;

// Находим все LabelDiscount
const discounts = doc.querySelectorAll('.LabelDiscount, [class*="LabelDiscount"]');
console.log(`Найдено LabelDiscount элементов: ${discounts.length}\n`);

// Анализируем первые 5
Array.from(discounts).slice(0, 5).forEach((el, i) => {
  console.log(`[${i + 1}] Класс: ${el.className.substring(0, 80)}`);
  console.log(`    Весь текст: "${el.textContent.trim()}"`);
  
  // Ищем Label-Content
  const labelContent = el.querySelector('.Label-Content, [class*="Label-Content"]');
  if (labelContent) {
    console.log(`    .Label-Content: "${labelContent.textContent.trim()}"`);
  } else {
    console.log(`    .Label-Content: НЕТ`);
  }
  
  // Показываем внутреннюю структуру
  console.log(`    Дети:`);
  el.childNodes.forEach((child, j) => {
    if (child.nodeType === 1) {  // Element
      const childEl = child;
      console.log(`      [${j}] <${childEl.tagName.toLowerCase()} class="${childEl.className.substring(0, 40)}">: "${childEl.textContent.trim().substring(0, 30)}"`);
    } else if (child.nodeType === 3 && child.textContent.trim()) {  // Text
      console.log(`      [${j}] TEXT: "${child.textContent.trim()}"`);
    }
  });
  console.log('');
});

// Проверим, есть ли EPriceGroup с withLabelDiscount
console.log('\n=== EPriceGroup классы ===');
const priceGroups = doc.querySelectorAll('[class*="EPriceGroup"]');
const uniqueClasses = new Set();
priceGroups.forEach(el => {
  el.className.split(' ').forEach(c => {
    if (c.includes('EPriceGroup')) uniqueClasses.add(c);
  });
});
console.log([...uniqueClasses].join('\n'));
