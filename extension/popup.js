/**
 * Contentify Extension — Popup (Clipboard-First Architecture)
 * 
 * Single-click to parse & copy to clipboard.
 * Relay is optional for automatic transfer.
 * Always works without requiring any setup.
 */

// Elements
const mainView = document.getElementById('mainView');
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

// Check relay availability (non-blocking)
async function checkRelay(url) {
  try {
    const res = await fetch(`${url}/status`, { signal: AbortSignal.timeout(1500) });
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
  mainView.className = `main-view ${state}`;
  
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
    case 'copied':
      indicator.textContent = '📋';
      break;
    default:
      indicator.textContent = '📤';
  }
}

// Copy data to clipboard
async function copyToClipboard(data) {
  try {
    await navigator.clipboard.writeText(data);
    return true;
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    return false;
  }
}

// Main send handler (clipboard-first)
async function handleClick() {
  if (isProcessing) return;
  
  isProcessing = true;
  setState('loading', 'Парсинг...', '');
  
  try {
    const tab = await getCurrentTab();
    
    if (!isYandexPage(tab.url)) {
      setState('disabled', 'Не Яндекс', 'Откройте ya.ru');
      isProcessing = false;
      return;
    }
    
    // Parse page
    const parseResult = await parsePageData(tab.id);
    
    if (!parseResult || parseResult.error || !parseResult.rows?.length) {
      setState('error', 'Нет данных', parseResult?.error || 'Сниппеты не найдены');
      isProcessing = false;
      return;
    }
    
    const rows = parseResult.rows;
    
    // Build payload
    setState('loading', `${rows.length} элементов...`, '');
    
    const payload = {
      schemaVersion: 1,
      source: { url: tab.url, title: tab.title },
      capturedAt: new Date().toISOString(),
      items: transformRowsForRelay(rows),
      rawRows: rows
    };
    
    const meta = { 
      url: tab.url, 
      parsedAt: new Date().toISOString(), 
      snippetCount: rows.length 
    };
    
    // Always copy to clipboard first (clipboard-first architecture)
    const clipboardData = JSON.stringify({
      type: 'contentify-paste',
      payload,
      meta
    });
    
    const copySuccess = await copyToClipboard(clipboardData);
    
    if (!copySuccess) {
      setState('error', 'Ошибка копирования', 'Попробуйте снова');
      isProcessing = false;
      return;
    }
    
    // Try to send to relay (optional, non-blocking)
    const relayUrl = await getRelayUrl();
    let relaySuccess = false;
    
    try {
      const relayOk = await checkRelay(relayUrl);
      if (relayOk) {
        const res = await fetch(`${relayUrl}/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload, meta }),
          signal: AbortSignal.timeout(2000)
        });
        relaySuccess = res.ok;
      }
    } catch {
      // Relay not available — clipboard fallback is already done
    }
    
    // Success!
    if (relaySuccess) {
      setState('success', `${rows.length} → Figma`, 'Автоматически!');
    } else {
      setState('copied', `${rows.length} скопировано`, 'Вставьте в Figma (⌘V)');
    }
    
    // Close popup after short delay
    setTimeout(() => window.close(), relaySuccess ? 1000 : 1500);
    
  } catch (err) {
    console.error('Error:', err);
    setState('error', 'Ошибка', err.message || 'Попробуйте снова');
  } finally {
    isProcessing = false;
  }
}

// Initialize
(async () => {
  const tab = await getCurrentTab();
  
  // Check if on Yandex page
  if (!isYandexPage(tab?.url)) {
    setState('disabled', 'Не Яндекс', 'Откройте ya.ru');
    return;
  }
  
  // Ready to parse and copy
  // Check relay for indicator only
  const relayUrl = await getRelayUrl();
  const relayOk = await checkRelay(relayUrl);
  
  if (relayOk) {
    setState('ready', 'Готов', 'Клик → Figma');
  } else {
    setState('ready', 'Готов', 'Клик → Скопировать');
  }
  
  // Bind click to main view
  mainView.addEventListener('click', handleClick);
})();
