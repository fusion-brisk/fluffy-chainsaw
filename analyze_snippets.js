const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('examples/iphone17.html', 'utf-8');
const dom = new JSDOM(html);
const doc = dom.window.document;

// Найти все контейнеры сниппетов
const selectors = [
  '[class*="Organic_withOfferInfo"]',
  '[class*="EProductSnippet2"]',
  '[class*="EShopItem"]',
  '.ProductTile-Item',
  '[class*="ProductTile-Item"]'
];

const containers = new Set();
selectors.forEach(sel => {
  doc.querySelectorAll(sel).forEach(el => containers.add(el));
});

// Фильтруем вложенные - оставляем только top-level
const topLevel = [];
containers.forEach(c => {
  let isNested = false;
  containers.forEach(other => {
    if (c !== other && other.contains(c)) isNested = true;
  });
  if (!isNested) topLevel.push(c);
});

console.log(`\n=== Найдено контейнеров: ${topLevel.length} ===\n`);

// Анализируем каждый контейнер
topLevel.forEach((container, idx) => {
  const classes = container.className.split(' ').filter(c => 
    c.includes('Organic') || c.includes('EProduct') || c.includes('EShop') || c.includes('ProductTile')
  );
  
  // Определяем тип
  let type = 'Unknown';
  if (container.className.includes('EProductSnippet2')) type = 'EProductSnippet2';
  else if (container.className.includes('EShopItem')) type = 'EShopItem';
  else if (container.className.includes('Organic_withOfferInfo')) type = 'Organic_withOfferInfo';
  
  // Title
  const titleEl = container.querySelector('.OrganicTitle, [class*="OrganicTitle"], .EProductSnippet2-Title, [class*="EProductSnippet2-Title"], .EShopItem-Title, [class*="EShopItem-Title"]');
  const title = titleEl ? titleEl.textContent.trim().substring(0, 70) : '(нет)';
  
  // Price
  const priceEl = container.querySelector('.EPrice-Value, [class*="EPrice-Value"]');
  const price = priceEl ? priceEl.textContent.trim() : '(нет)';
  
  // Shop
  const shopEl = container.querySelector('.EShopName .Line-AddonContent, .EShopName, [class*="EShopName"], .Path');
  const shop = shopEl ? shopEl.textContent.trim().substring(0, 50).replace(/\s+/g, ' ') : '(нет)';
  
  // Image
  const imgEl = container.querySelector('.EThumb-Image, [class*="EThumb"] img, .Organic-OfferThumbImage, img');
  const imgSrc = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '').substring(0, 60) : '';
  
  // Favicon
  const favEl = container.querySelector('.Favicon, [class*="Favicon"]');
  const favClass = favEl ? favEl.className.match(/Favicon-Page\d+_pos_\d+|Favicon-Page\d+|Favicon_outer/)?.[0] || 'Favicon' : 'нет';
  
  // Rating
  const ratingEl = container.querySelector('.ELabelRating:not(.LabelDiscount) .Label-Content, .ELabelRating:not(.LabelDiscount)');
  const rating = ratingEl ? ratingEl.textContent.trim() : '(нет)';
  
  // Delivery
  const deliveryItems = container.querySelectorAll('.EDeliveryGroup-Item');
  const deliveryCount = deliveryItems.length;
  
  // OldPrice / Discount
  const oldPriceEl = container.querySelector('.EPrice_view_old .EPrice-Value, [class*="EPrice_view_old"]');
  const oldPrice = oldPriceEl ? oldPriceEl.textContent.trim() : '';
  const discountEl = container.querySelector('.LabelDiscount .Label-Content, .LabelDiscount');
  const discount = discountEl ? discountEl.textContent.trim() : '';
  
  // Fintech
  const fintechEl = container.querySelector('.Fintech:not(.Fintech-Icon), [class*="EPriceGroup-Fintech"]');
  const fintechType = fintechEl?.className.match(/Fintech_type_(\w+)/)?.[1] || '';
  
  // EPriceBarometer
  const barometerEl = container.querySelector('.EPriceBarometer, [class*="EPriceBarometer"]');
  const barometerView = barometerEl?.className.match(/EPriceBarometer-(\w+)/)?.[1] || '';
  
  // Official Shop
  const officialEl = container.querySelector('.OfficialShop, [class*="OfficialShop"]');
  
  // EMarketCheckoutLabel
  const checkoutLabel = container.querySelector('.EMarketCheckoutLabel, [class*="EMarketCheckoutLabel"]');
  
  console.log(`[${idx + 1}] ${type}`);
  console.log(`    📝 Title: ${title}`);
  console.log(`    🏪 Shop: ${shop}${officialEl ? ' ✓Official' : ''}`);
  console.log(`    💰 Price: ${price}${oldPrice ? ` (было: ${oldPrice})` : ''}${discount ? ` скидка: ${discount}` : ''}`);
  console.log(`    🖼️ Image: ${imgSrc ? 'есть' : 'нет'}, Favicon: ${favClass}`);
  console.log(`    ⭐ Rating: ${rating}${barometerView ? `, Barometer: ${barometerView}` : ''}`);
  console.log(`    🚚 Delivery items: ${deliveryCount}${fintechType ? `, Fintech: ${fintechType}` : ''}${checkoutLabel ? ', ✓CheckoutLabel' : ''}`);
  console.log('');
});
