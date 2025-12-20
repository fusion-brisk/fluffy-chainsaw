const fs = require('fs');
const { JSDOM } = require('jsdom');

const htmlPath = '/Users/shchuchkin/Downloads/nocord шуруповерт купить — Яндекс: нашёлся 1 млн результатов.html';
const html = fs.readFileSync(htmlPath, 'utf-8');

const dom = new JSDOM(html);
const doc = dom.window.document;

// EProductSnippet2 — проверяем уникальность
const snippets = doc.querySelectorAll('.EProductSnippet2');
console.log(`\n=== EProductSnippet2: ${snippets.length} шт. ===\n`);

const urlMap = new Map();
const titleMap = new Map();

snippets.forEach((c, i) => {
  const titleEl = c.querySelector('.EProductSnippet2-Title, .OrganicTitle');
  const title = titleEl ? titleEl.textContent?.trim().substring(0, 40) : '?';
  
  const priceEl = c.querySelector('.EPrice-Value');
  const price = priceEl ? priceEl.textContent?.replace(/[^\d]/g, '') : '?';
  
  const linkEl = c.querySelector('a[href*="http"]');
  const url = linkEl ? linkEl.getAttribute('href') : '';
  
  // Группируем по URL
  if (!urlMap.has(url)) urlMap.set(url, []);
  urlMap.get(url).push({ idx: i+1, title, price });
  
  // Группируем по Title
  if (!titleMap.has(title)) titleMap.set(title, []);
  titleMap.get(title).push({ idx: i+1, price, url: url?.substring(0, 30) });
  
  console.log(`[${i+1}] ${title} | ${price}₽`);
});

console.log(`\n=== УНИКАЛЬНОСТЬ ===`);
console.log(`Уникальных URL: ${urlMap.size}`);
console.log(`Уникальных Title: ${titleMap.size}`);

// Показываем дубликаты
const titleDupes = Array.from(titleMap.entries()).filter(([k,v]) => v.length > 1);
if (titleDupes.length) {
  console.log(`\nДубликаты по Title:`);
  titleDupes.forEach(([title, items]) => {
    console.log(`  "${title}" x${items.length}`);
  });
}
