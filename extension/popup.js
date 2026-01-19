/**
 * EProductSnippet Extension — Minimal Popup
 * 
 * Single-click to parse & send to Figma.
 * Settings available via Options page (right-click → Options)
 */

const popup = document.getElementById('popup');
const indicator = document.getElementById('indicator');
const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');

let isProcessing = false;

// Check if page is Yandex
function isYandexPage(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.includes('yandex') || hostname.includes('ya.ru');
  } catch {
    return false;
  }
}

// Get current tab
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Get relay URL from storage
async function getRelayUrl() {
  const { relayUrl } = await chrome.storage.local.get('relayUrl');
  return relayUrl || 'http://localhost:3847';
}

// Check relay availability
async function checkRelay(url) {
  try {
    const res = await fetch(`${url}/status`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Parse page data
async function parsePageData(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
  return results[0]?.result;
}

// Transform rows for relay
function transformRowsForRelay(rows) {
  return rows.map(row => ({
    title: row['#OrganicTitle'] || '',
    priceText: row['#OrganicPrice'] ? `${row['#OrganicPrice']} ${row['#Currency'] || '₽'}` : '',
    href: row['#ProductURL'] || '',
    imageUrl: row['#OrganicImage'] || '',
    shopName: row['#ShopName'] || '',
    domain: row['#OrganicHost'] || '',
    faviconUrl: row['#FaviconImage'] || '',
    productRating: row['#ProductRating'] || '',
    shopRating: row['#ShopInfo-Ugc'] || row['#ShopRating'] || '',
    currentPrice: row['#OrganicPrice'] || '',
    oldPrice: row['#OldPrice'] || '',
    discountPercent: row['#DiscountPercent'] || '',
    discount: row['#discount'] || '',
    currency: row['#Currency'] || '₽',
    snippetType: row['#SnippetType'] || 'Organic',
    _rawCSVRow: row
  }));
}

// Update UI state
function setState(state, message, hint = '') {
  indicator.className = `indicator ${state}`;
  statusEl.className = `status ${state}`;
  statusEl.textContent = message;
  hintEl.textContent = hint;
  popup.className = state;
  
  // Update indicator icon
  switch (state) {
    case 'loading':
      indicator.textContent = '⏳';
      break;
    case 'success':
      indicator.textContent = '✅';
      break;
    case 'error':
      indicator.textContent = '❌';
      break;
    case 'disabled':
      indicator.textContent = '🌐';
      break;
    default:
      indicator.textContent = '📤';
  }
}

// Main send handler
async function handleClick() {
  if (isProcessing) return;
  
  isProcessing = true;
  setState('loading', 'Отправка...', '');
  
  try {
    const tab = await getCurrentTab();
    
    if (!isYandexPage(tab.url)) {
      setState('disabled', 'Не страница Яндекса', 'Откройте ya.ru');
      isProcessing = false;
      return;
    }
    
    const relayUrl = await getRelayUrl();
    
    // Check relay
    const relayOk = await checkRelay(relayUrl);
    if (!relayOk) {
      setState('error', 'Relay недоступен', 'Запустите сервер');
      isProcessing = false;
      return;
    }
    
    // Parse page
    setState('loading', 'Парсинг...', '');
    const parseResult = await parsePageData(tab.id);
    
    if (!parseResult || parseResult.error || !parseResult.rows?.length) {
      setState('error', 'Нет данных', parseResult?.error || 'Сниппеты не найдены');
      isProcessing = false;
      return;
    }
    
    const rows = parseResult.rows;
    
    // Send to relay
    setState('loading', `${rows.length} элементов...`, '');
    
    const payload = {
      schemaVersion: 1,
      source: { url: tab.url, title: tab.title },
      capturedAt: new Date().toISOString(),
      items: transformRowsForRelay(rows),
      rawRows: rows
    };
    
    const res = await fetch(`${relayUrl}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload,
        meta: { url: tab.url, parsedAt: new Date().toISOString(), snippetCount: rows.length }
      })
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    // Success!
    setState('success', `${rows.length} → Figma`, 'Готово!');
    
    // Close popup after short delay
    setTimeout(() => window.close(), 1200);
    
  } catch (err) {
    setState('error', 'Ошибка', err.message || 'Попробуйте снова');
  } finally {
    isProcessing = false;
  }
}

// Initialize
(async () => {
  const tab = await getCurrentTab();
  const relayUrl = await getRelayUrl();
  
  // Check if on Yandex page
  if (!isYandexPage(tab?.url)) {
    setState('disabled', 'Не Яндекс', 'Откройте ya.ru');
    hintEl.textContent = '';
    return;
  }
  
  // Check relay availability
  const relayOk = await checkRelay(relayUrl);
  
  if (relayOk) {
    setState('ready', 'Готов', 'Клик для отправки');
  } else {
    setState('error', 'Relay недоступен', 'Настройки: ПКМ → Options');
  }
  
  // Bind click to entire popup
  popup.addEventListener('click', handleClick);
})();
